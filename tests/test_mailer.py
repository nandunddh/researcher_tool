"""Every SciProspect email ends with the same sign-off and the contact details from backend/.env."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import mailer  # noqa: E402

BOTH = {"SCIPROSPECT_CONTACT_EMAIL": " hello@sciprospect.example ", "SCIPROSPECT_CONTACT_PHONE": "+91 98765 43210"}
NONE = {"SCIPROSPECT_CONTACT_EMAIL": "", "SCIPROSPECT_CONTACT_PHONE": ""}


class FakeSMTP:
    sent = []

    def __init__(self, host, port, timeout):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        pass

    def login(self, user, password):
        pass

    def send_message(self, msg):
        FakeSMTP.sent.append(msg)


class SignatureTests(unittest.TestCase):
    def test_contact_details_are_shown_and_linked(self):
        with patch.dict(os.environ, BOTH):
            text, html = mailer.signature()
        self.assertEqual(text, "\n\nThanks and Regards,\nThe SciProspect team\nEmail: hello@sciprospect.example\nPhone: +91 98765 43210")
        self.assertIn('<a href="mailto:hello@sciprospect.example">', html)
        self.assertIn('<a href="tel:+919876543210">+91 98765 43210</a>', html)

    def test_missing_details_are_left_out(self):
        with patch.dict(os.environ, NONE):
            text, html = mailer.signature()
        self.assertEqual(text, "\n\nThanks and Regards,\nThe SciProspect team")
        self.assertNotIn("Email", html)
        with patch.dict(os.environ, {**NONE, "SCIPROSPECT_CONTACT_PHONE": "123"}):
            self.assertNotIn("Email", mailer.signature()[0])

    def test_values_are_escaped_in_html(self):
        with patch.dict(os.environ, {**NONE, "SCIPROSPECT_CONTACT_EMAIL": 'a"><script>@x.org'}):
            html = mailer.signature()[1]
        self.assertNotIn("<script>", html)


class PublicContactTests(unittest.TestCase):
    def test_the_legal_pages_get_the_same_details_the_emails_show(self):
        import asyncio
        import app as web_app
        with patch.dict(os.environ, BOTH):
            self.assertEqual(asyncio.run(web_app.public_contact()), {"email": "hello@sciprospect.example", "phone": "+91 98765 43210"})
        with patch.dict(os.environ, NONE):
            self.assertEqual(asyncio.run(web_app.public_contact()), {"email": "", "phone": ""})


class SendTests(unittest.TestCase):
    def send(self, **kwargs):
        FakeSMTP.sent.clear()
        with patch.dict(os.environ, {**BOTH, "SCIPROSPECT_SMTP_HOST": "smtp.test"}), patch.object(mailer.smtplib, "SMTP", FakeSMTP):
            mailer.send_mail("ada@lab.org", "Hi", "Body", "<p>Body</p>", **kwargs)
        msg = FakeSMTP.sent[0]
        return msg.get_body(("plain",)).get_content(), msg.get_body(("html",)).get_content()

    def test_every_mail_is_signed_by_default(self):
        text, html = self.send()
        self.assertTrue(text.rstrip().endswith("Phone: +91 98765 43210"))
        self.assertIn("Thanks and Regards", html)

    def test_unsigned_mail_has_no_sign_off(self):
        text, html = self.send(sign=False)
        self.assertNotIn("Thanks and Regards", text + html)


if __name__ == "__main__":
    unittest.main()
