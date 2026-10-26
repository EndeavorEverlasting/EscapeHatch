import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from audit_resume_docx import analyze

XML = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{}</w:body></w:document>'
P = '<w:p><w:r>{}<w:t>{}</w:t></w:r></w:p>'
B = '<w:rPr><w:b/></w:rPr>'

class ResumeDocxAuditTests(unittest.TestCase):
    def run_doc(self, xml):
        with TemporaryDirectory() as folder:
            name = Path(folder) / 'synthetic.docx'
            with ZipFile(name, 'w') as archive:
                archive.writestr('word/document.xml', XML.format(xml))
            return analyze(name)

    def test_bold_section(self):
        self.assertEqual(self.run_doc(P.format(B, 'EXPERIENCE'))[1], [])

    def test_unbold_section(self):
        self.assertEqual(self.run_doc(P.format('', 'EXPERIENCE'))[1][0][1], 'section_heading_unbold')

    def test_unbold_inline_subsection(self):
        self.assertEqual(self.run_doc(P.format('', 'Delivery Systems: Built pipelines.'))[1][0][1], 'inline_subsection_label_unbold')

    def test_non_heading_is_not_flagged(self):
        self.assertEqual(self.run_doc(P.format('', 'I coordinated complex technical work.'))[0], 0)

if __name__ == '__main__':
    unittest.main()
