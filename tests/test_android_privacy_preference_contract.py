"""Static Android privacy toggle gate; no device/browser proof."""
from pathlib import Path
from xml.etree import ElementTree as ET
root = Path(__file__).resolve().parents[1]
app = root / "android/application-assist/app/src/main"
store = (app / "java/com/escapehatch/assist/ApplicantPrivacyPreferenceStore.kt").read_text()
activity = (app / "java/com/escapehatch/assist/CompanionActivity.kt").read_text()
layout = ET.parse(app / "res/layout/activity_companion.xml")
strings = (app / "res/values/strings.xml").read_text()
required = ["escapeHatch.applicationQuestionPreferences.v1", "application_privacy_acknowledgement_enabled", "getBoolean(FLAG, false)", "Context.MODE_PRIVATE", "putBoolean(FLAG, value).commit()", "isEnabled() == value"]
assert all(s in store for s in required)
assert all(s in activity for s in ["privacyPreference.setEnabled(enabled)", "R.id.applicantPrivacyToggle", "renderPrivacyPreference()"])
assert any(e.attrib.get("{http://schemas.android.com/apk/res/android}id") == "@+id/applicantPrivacyToggle" for e in layout.iter())
assert all(s in strings for s in ["privacy_preference_label", "privacy_preference_enabled", "privacy_preference_disabled"])
assert "Employer-site consent automation is not available" in strings
android_gradle = (root / "android/application-assist/app/build.gradle.kts").read_text()
assert 'rootProject.file("../../VERSION")' in android_gradle
assert "versionCode = canonicalVersionCode" in android_gradle
assert "versionName = canonicalVersion" in android_gradle
assert (root / "VERSION").read_text().strip().count(".") >= 2
print("ANDROID_PRIVACY_PREFERENCE_BOOTSTRAP_STATIC: PASS (not APK or device proof)")
