plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Product release identity comes from repository VERSION, never an independent Android label.
val canonicalVersion = rootProject.file("../../VERSION").readText().trim()
val versionParts = canonicalVersion.split(".")
require(versionParts.size == 3 && versionParts.all { it.toIntOrNull() != null }) {
    "Android bootstrap requires the canonical stable SemVer from VERSION"
}
val releaseNumbers = versionParts.map { it.toInt() }
require(releaseNumbers[0] in 0..2099 && releaseNumbers[1] in 0..999 && releaseNumbers[2] in 0..999) {
    "Product version exceeds monotonic Android versionCode encoding"
}
val canonicalVersionCode = releaseNumbers[0] * 1_000_000 + releaseNumbers[1] * 1_000 + releaseNumbers[2]


android {
    namespace = "com.escapehatch.assist"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.escapehatch.assist"
        minSdk = 26
        targetSdk = 34
        versionCode = canonicalVersionCode
        versionName = canonicalVersion
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.activity:activity-ktx:1.9.1")
    testImplementation("junit:junit:4.13.2")
}
