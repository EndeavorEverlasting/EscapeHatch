#!/usr/bin/env python3
"""Offline micro1 .eml milestone classifier: no Gmail API, login, or data exposure."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from email import policy
from email.parser import BytesParser
from email.utils import parseaddr
from pathlib import Path

SCHEMA = 'escapehatch/micro1-milestone-import/v1'
ENTRY = 'https://talent.micro1.ai/dashboard?discord=join'
MAX_BYTES = 2 * 1024 * 1024


def classify_eml(data: bytes) -> dict:
    if not data or len(data) > MAX_BYTES:
        raise ValueError('EML_SIZE_INVALID')
    message = BytesParser(policy=policy.default).parsebytes(data)
    sender = parseaddr(str(message.get('from', '')))[1].lower()
    if sender not in ('support@micro1.io', 'support@micro1.ai', 'support@micro1.co'):
        raise ValueError('UNRECOGNIZED_MICRO1_SENDER')
    if str(message.get('subject', '')).strip().lower() != 'your next steps with micro1':
        raise ValueError('UNEXPECTED_MESSAGE_PURPOSE')
    if message.is_multipart():
        parts = [p for p in message.walk() if p.get_content_type() == 'text/plain' and not p.is_multipart()]
        if not parts:
            raise ValueError('MISSING_TEXT_PART')
        body = parts[0].get_content()
    else:
        if message.get_content_type() != 'text/plain':
            raise ValueError('MISSING_TEXT_PART')
        body = message.get_content()
    if not isinstance(body, str) or len(body) > 100_000:
        raise ValueError('INVALID_TEXT_PART')
    normalized = re.sub(r'\s+', ' ', body)
    has_entry = ENTRY in body
    certified = bool(re.search(r'congrats on becoming micro1 certified', normalized, re.I))
    profile_active = bool(re.search(r'your profile remains active for future opportunities', normalized, re.I))
    matching_reported = bool(re.search(r"we(?:'|’)re matching you with roles", normalized, re.I))
    authentication_header = str(message.get('authentication-results', '')).lower()
    reported_dkim_pass = 'dkim=pass' in authentication_header and 'micro1.io' in authentication_header
    return {
        'schema': SCHEMA,
        'employerKey': 'micro1',
        'source': 'operator_supplied_eml',
        'sourceSha256': hashlib.sha256(data).hexdigest(),
        'senderDomainClaim': sender.rsplit('@', 1)[-1],
        'reportedDkimPass': reported_dkim_pass,
        'providerCryptographicVerification': False,
        'entrypoint': ENTRY if has_entry else None,
        'milestones': {
            'certification': 'SOURCE_CONFIRMED' if certified else 'NOT_OBSERVED',
            'talent_profile': 'SOURCE_REPORTED_ACTIVE' if profile_active else 'NOT_OBSERVED',
            'discord_membership': 'NOT_VERIFIED',
            'role_matching': 'SOURCE_REPORTED_PENDING' if matching_reported else 'NOT_OBSERVED',
            'job_application': 'NOT_ASSESSED',
        },
        'containsPersonalData': False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(classify_eml(args.input.read_bytes()), sort_keys=True, indent=2))


if __name__ == '__main__':
    main()
