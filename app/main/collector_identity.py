"""Conservative author/contact attribution without guessing email addresses."""
import re
import unicodedata
import xml.etree.ElementTree as ET

PATTERN = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')

def tokens(value):
    value = unicodedata.normalize('NFKD', value or '').encode('ascii', 'ignore').decode().lower()
    return re.findall(r'[a-z]+', value)

def same_name(left, right):
    a, b = tokens(left), tokens(right)
    return len(a) >= 2 and len(b) >= 2 and a[-1] == b[-1] and (a[0] == b[0] or (len(a[0]) == 1 or len(b[0]) == 1) and a[0][0] == b[0][0])

def name_matches_email(name, email):
    parts = tokens(name)
    handle = ''.join(tokens(email.partition('@')[0]))
    if len(parts) < 2 or len(parts[-1]) < 3:
        return False
    first, last = parts[0], parts[-1]
    return handle in {first + last, first[0] + last, last + first, last + first[0], '.'.join(parts).replace('.', '')}

def author_email(xml, name):
    """Resolve direct contributor email or explicit contributor-to-correspondence references."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return ''
    for node in root.iter():
        node.tag = node.tag.split('}')[-1]
    by_id = {n.get('id'): n for n in root.iter() if n.get('id')}
    for author in root.findall('.//contrib'):
        if author.get('contrib-type', 'author') != 'author':
            continue
        n = author.find('name')
        if n is None:
            continue
        full = ' '.join(''.join(n.findtext(k, default='')) for k in ('given-names', 'surname'))
        if not same_name(name, full):
            continue
        contacts = list(author.findall('.//email'))
        for ref in author.findall('.//xref'):
            if ref.get('ref-type') == 'corresp':
                for rid in ref.get('rid', '').split():
                    if rid in by_id:
                        contacts.extend(by_id[rid].findall('.//email'))
        emails = {m.lower() for c in contacts for m in PATTERN.findall(''.join(c.itertext()))}
        if len(emails) == 1:
            return emails.pop()
    return ''
