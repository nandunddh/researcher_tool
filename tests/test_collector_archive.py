"""PostgreSQL integration checks. Run only against an explicitly selected test schema."""
import os
from pathlib import Path
import subprocess
import sys
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "app/main")]


@unittest.skipUnless(os.environ.get("SCIPROSPECT_DB_SCHEMA","").startswith("test_") and os.environ.get("SCIPROSPECT_DB_HOST"), "requires an isolated PostgreSQL test schema")
class CollectorArchiveTests(unittest.TestCase):
    def test_fallback_dedup_evidence_and_restart(self):
        import collector_archive as store
        import db
        owner = "test:" + uuid.uuid4().hex
        def create():
            return store.create(owner, "materials", 3, 50, "2025-01-01", "2025-02-01")
        old = create()
        archived = {"email":"old@fixture.test","researcher_name":"Old"}
        store.Archive(owner, old).save(archived)
        self.assertTrue(store.stop(owner, old))
        run = create()
        calls = []
        def loader(name):
            def collect(archive, target_leads, **params):
                calls.append((name,target_leads))
                if name=="OpenAlex":
                    self.assertFalse(archive.save(archived))
                    self.assertTrue(archive.save({"email":"ada@fixture.test","source":name}))
                    self.assertFalse(archive.save({"email":"ada@fixture.test","source":name}))
                    raise RuntimeError("simulated upstream failure")
                self.assertFalse(archive.save({"email":"ada@fixture.test","source":name,"doi":"fixture"}))
                self.assertTrue(archive.save({"email":"lin@fixture.test","source":name}))
            return collect
        store.execute(owner,run,[("OpenAlex","OpenAlex"),("bioRxiv","bioRxiv")],loader)
        self.assertEqual(calls,[("OpenAlex",3),("bioRxiv",2)])
        latest = store.history(owner)[0]
        self.assertEqual((latest["status"],latest["shortfall"],latest["collected"]),("partial",1,2))
        self.assertEqual(latest["source_errors"][0]["source"],"OpenAlex")
        with db.transaction() as cur:
            cur.execute("SELECT count(*) FROM collector_evidence WHERE owner_key=%s AND email=%s",(owner,"ada@fixture.test"))
            self.assertEqual(cur.fetchone()[0],2)
        with self.assertRaises(KeyError):
            store.csv_export(owner+"other",run)
        env = dict(os.environ, PYTHONPATH=os.pathsep.join(map(str,[ROOT/"backend",ROOT/"app/main"])))
        output = subprocess.check_output([sys.executable,"-c","import sys,collector_archive as a;sys.stdout.buffer.write(a.csv_export(*sys.argv[1:]))",owner,run],env=env)
        self.assertIn(b"ada@fixture.test",output)
        self.assertIn(b"lin@fixture.test",output)
        self.assertNotIn(b"old@fixture.test",output)

    def test_interrupted_run_releases_workspace(self):
        from psycopg2.errors import UniqueViolation
        import db
        import collector_archive as store
        owner="test:"+uuid.uuid4().hex
        args=(owner,"materials",5,50,"2025-01-01","2025-02-01")
        old=store.create(*args)
        with self.assertRaises(UniqueViolation):
            store.create(*args)
        with db.transaction() as cur:
            cur.execute("UPDATE collector_runs SET updated_at=now()-interval '5 minutes' WHERE owner_key=%s",(owner,))
        new=store.create(*args)
        self.assertFalse(store.Archive(owner,old).save({"email":"old@fixture.test"}))
        self.assertTrue(store.stop(owner,new))

    def test_web_start_refresh_and_download_with_real_adapters(self):
        import json
        import socket
        import threading
        import time
        from types import SimpleNamespace
        from urllib.request import Request, urlopen
        from unittest.mock import patch
        from fastapi import FastAPI, HTTPException
        import uvicorn
        from collector_routes import collector_router

        user_email = uuid.uuid4().hex + "@fixture.test"
        def user(request):
            if request.headers.get("X-Fixture-User") != user_email:
                raise HTTPException(401)
            return {"client_email": user_email}

        def source_response(session, url, *args, **kwargs):
            if url.endswith("/works"):
                items = [{"title":"Materials science", "authorships":[{"author":{"display_name":"Ada Fixture",
                    "orcid":"https://orcid.org/0000-0000-0000-0000"},"is_corresponding":True}]}]
                data = {"results":items if kwargs["params"]["page"] == 1 else []}
            elif url.endswith("/email"):
                data = {"email":[{"email":"ada.fixture@fixture.test"}]}
            elif "api.biorxiv.org" in url:
                data = {"collection":[]}
            else:
                raise AssertionError("Unexpected source request")
            return SimpleNamespace(status_code=200,json=lambda: data)

        app = FastAPI()
        app.include_router(collector_router(user, SimpleNamespace(validate_license=lambda _: {"valid":True})))
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0))
            sock.listen()
            base = "http://127.0.0.1:" + str(sock.getsockname()[1]) + "/api/collector/runs"
            server = uvicorn.Server(uvicorn.Config(app,log_level="error"))
            thread = threading.Thread(target=server.run,kwargs={"sockets":[sock]},daemon=True)
            with patch("requests.Session.get",source_response), patch("app_config.get_data_dir",side_effect=AssertionError("web worker opened local archive")):
                thread.start()
                try:
                    deadline = time.monotonic()+20
                    while not server.started and time.monotonic()<deadline:
                        time.sleep(.05)
                    def fetch(path="",body=None):
                        return urlopen(Request(base+path,data=json.dumps(body).encode() if body else None,
                            headers={"X-Fixture-User":user_email,"Content-Type":"application/json"}),timeout=10).read()
                    run = json.loads(fetch(body={"topic":"Materials science","target":2,"min_score":0,
                        "from_date":"2025-01-01","to_date":"2025-02-01"}))["id"]
                    while time.monotonic()<deadline:
                        current = json.loads(fetch())[0]
                        if current["status"]!="running":
                            break
                        time.sleep(.05)
                    self.assertEqual((current["status"],current["collected"],current["source"]),("partial",1,"bioRxiv"))
                    self.assertEqual(current["source_errors"],[])
                    rows = json.loads(fetch("/"+run+"/results"))
                    self.assertEqual(rows[0]["email_confidence"],"author_linked")
                    self.assertIn(b"ada.fixture@fixture.test",fetch("/"+run+"/export"))
                finally:
                    server.should_exit=True
                    thread.join(10)
