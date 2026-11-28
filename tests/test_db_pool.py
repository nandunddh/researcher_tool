"""db.transaction never hands out a connection the server already dropped (it still says closed == 0 until used)."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import db  # noqa: E402


class FakeConn:
    def __init__(self, alive=True):
        self.alive, self.closed, self.pings, self.commits = alive, 0, 0, 0

    def cursor(self):
        conn = self

        class Cur:
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def execute(self, sql, *args):
                if not conn.alive:
                    conn.closed = 2
                    raise OSError("server closed the connection unexpectedly")
                if sql == "SELECT 1":
                    conn.pings += 1
        return Cur()

    def rollback(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, *rest):
        if exc_type is None:
            self.commits += 1
        return False


class FakePool:
    maxconn = 3

    def __init__(self, idle):
        self.idle, self.opened, self.closed_conns, self.returned = list(idle), [], [], []

    def getconn(self):
        if self.idle:
            return self.idle.pop(0)
        conn = FakeConn()
        self.opened.append(conn)
        return conn

    def putconn(self, conn, close=False):
        (self.closed_conns if close else self.returned).append(conn)


class TransactionTests(unittest.TestCase):
    def run_one(self, pool):
        with patch.object(db, "ensure_migrated", lambda: None), patch.object(db, "_get_pool", lambda: pool), \
             patch.dict(db._last_used, clear=True):
            with db.transaction() as cur:
                cur.execute("INSERT")
            return dict(db._last_used)

    def test_a_dropped_idle_connection_is_replaced_before_use(self):
        dead = FakeConn(alive=False)
        pool = FakePool([dead])
        self.run_one(pool)
        self.assertEqual(pool.closed_conns, [dead])
        self.assertEqual(len(pool.opened), 1)
        self.assertEqual((pool.returned, pool.opened[0].commits), (pool.opened, 1))

    def test_every_dead_connection_is_skipped(self):
        dead = [FakeConn(alive=False) for _ in range(FakePool.maxconn)]
        pool = FakePool(dead)
        self.run_one(pool)
        self.assertEqual(pool.closed_conns, dead)
        self.assertEqual(pool.returned, pool.opened)

    def test_a_recently_used_connection_is_not_pinged(self):
        conn = FakeConn()
        pool = FakePool([conn])
        with patch.object(db, "ensure_migrated", lambda: None), patch.object(db, "_get_pool", lambda: pool), \
             patch.dict(db._last_used, {id(conn): db.monotonic()}, clear=True):
            with db.transaction() as cur:
                cur.execute("INSERT")
        self.assertEqual((conn.pings, pool.returned), (0, [conn]))

    def test_an_idle_connection_is_pinged_once_then_used(self):
        conn = FakeConn()
        pool = FakePool([conn])
        used = self.run_one(pool)
        self.assertEqual((conn.pings, pool.returned, list(used)), (1, [conn], [id(conn)]))

    def test_a_connection_that_breaks_mid_transaction_is_not_put_back(self):
        conn = FakeConn()
        pool = FakePool([conn])
        with patch.object(db, "ensure_migrated", lambda: None), patch.object(db, "_get_pool", lambda: pool), \
             patch.dict(db._last_used, {id(conn): db.monotonic()}, clear=True):
            with self.assertRaises(OSError):
                with db.transaction() as cur:
                    conn.alive = False
                    cur.execute("INSERT")
        self.assertEqual((pool.closed_conns, pool.returned), ([conn], []))


if __name__ == "__main__":
    unittest.main()
