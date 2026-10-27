#!/usr/bin/env python3
"""Audit scan-readability of a private DOCX without logging its text.
Structural preflight only; rendered-page visual QA is still required.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
from zipfile import ZipFile

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

def attr(element, name):
    return element.get(W + name) if element is not None else None

def is_bold(rpr):
    b = rpr.find(W + 'b') if rpr is not None else None
    return None if b is None else attr(b, 'val') not in ('0', 'false', 'off')

def analyze(path: Path) -> tuple[int, list[tuple[int, str]]]:
    with ZipFile(path) as z:
        document = ET.fromstring(z.read('word/document.xml'))
        styles = ET.fromstring(z.read('word/styles.xml')) if 'word/styles.xml' in z.namelist() else None
    style_bold = {}
    if styles is not None:
        for style in styles.findall(W + 'style'):
            sid = attr(style, 'styleId')
            if sid:
                style_bold[sid] = (is_bold(style.find(W + 'rPr')), attr(style.find(W + 'basedOn'), 'val'))
    def style_is_bold(sid):
        seen = set()
        while sid and sid not in seen:
            seen.add(sid)
            own, parent = style_bold.get(sid, (None, None))
            if own is not None:
                return own
            sid = parent
        return False

    issues = []
    inspected = 0
    paragraphs = document.findall('.//' + W + 'body/' + W + 'p')
    for number, p in enumerate(paragraphs, 1):
        runs = []
        for run in p.findall('.//' + W + 'r'):
            chunk = ''.join(t.text or '' for t in run.findall(W + 't'))
            if chunk:
                runs.append((chunk, run))
        text = ''.join(t for t, _ in runs).strip()
        if not text:
            continue
        ppr = p.find(W + 'pPr')
        ps = attr(ppr.find(W + 'pStyle'), 'val') if ppr is not None else None
        section = bool(re.search(r'heading|section', ps or '', re.I)) or (
            4 <= len(text) <= 70 and text == text.upper() and bool(re.search('[A-Z]{2}', text))
            and not re.search(r'\b\d{3,}\b', text)
        )
        inline = re.match(r'^([A-Za-z][A-Za-z /&-]{2,52}):\s+\S', text)
        if not section and not inline:
            continue
        inspected += 1
        label = text if section else inline.group(1) + ':'
        covered, all_bold = 0, True
        for chunk, run in runs:
            relevant = min(len(chunk), max(0, len(label) - covered))
            if relevant > 0 and chunk[:relevant].strip():
                rpr = run.find(W + 'rPr')
                explicit = is_bold(rpr)
                rs = attr(rpr.find(W + 'rStyle'), 'val') if rpr is not None else None
                effective = explicit if explicit is not None else style_is_bold(rs) or style_is_bold(ps)
                if not effective:
                    all_bold = False
            covered += len(chunk)
            if covered >= len(label):
                break
        if not all_bold:
            issues.append((number, 'section_heading_unbold' if section else 'inline_subsection_label_unbold'))
    return inspected, issues

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('docx', type=Path)
    args = parser.parse_args()
    try:
        inspected, issues = analyze(args.docx)
    except (OSError, ET.ParseError, KeyError) as error:
        print('DOCX_AUDIT_BLOCKED:', type(error).__name__)
        return 2
    print(f'DOCX_BOLD_AUDIT checked={inspected} failures={len(issues)}')
    for paragraph, reason in issues:
        print(f'FAIL paragraph={paragraph} reason={reason}')
    print('NOTE structural check only; PDF/DOCX render and visual QA still required')
    return 1 if issues else 0

if __name__ == '__main__':
    sys.exit(main())
