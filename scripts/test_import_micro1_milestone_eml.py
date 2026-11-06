import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('micro1', Path(__file__).with_name('import_micro1_milestone_eml.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class MilestoneImportTests(unittest.TestCase):
    def message(self, sender='micro1 <support@micro1.io>', body=''):
        return (f'From: {sender}\nSubject: Your Next Steps with micro1\n'
                'Content-Type: text/plain; charset=utf-8\n\n'+body).encode('utf-8')

    def test_positive_receipt_and_no_private_data_leak(self):
        raw=self.message(body='Hi Private Person,\nCongrats on becoming micro1 certified. '
            "We're matching you with roles that align with your certified skills. "
            'Your profile remains active for future opportunities. '
            'Join: https://talent.micro1.ai/dashboard?discord=join. '
            'Secret certificate https://example.test/private.jpg')
        result=module.classify_eml(raw)
        self.assertEqual(result['milestones']['certification'],'SOURCE_CONFIRMED')
        self.assertEqual(result['milestones']['discord_membership'],'NOT_VERIFIED')
        self.assertEqual(result['milestones']['talent_profile'],'SOURCE_REPORTED_ACTIVE')
        self.assertEqual(result['milestones']['role_matching'],'SOURCE_REPORTED_PENDING')
        self.assertEqual(result['entrypoint'],module.ENTRY)
        self.assertNotIn('Private Person',str(result))
        self.assertNotIn('private.jpg',str(result))
        self.assertFalse(result['providerCryptographicVerification'])

    def test_wrong_sender_and_size_rejected(self):
        with self.assertRaisesRegex(ValueError,'UNRECOGNIZED_MICRO1_SENDER'):
            module.classify_eml(self.message(sender='imposter <support@micro1.io.evil.test>'))
        with self.assertRaisesRegex(ValueError,'EML_SIZE_INVALID'):
            module.classify_eml(b'')

    def test_invitation_never_infers_certification_or_join(self):
        result=module.classify_eml(self.message(body='Join https://talent.micro1.ai/dashboard?discord=join'))
        self.assertEqual(result['milestones']['certification'],'NOT_OBSERVED')
        self.assertEqual(result['milestones']['discord_membership'],'NOT_VERIFIED')

if __name__ == '__main__':
    unittest.main()
