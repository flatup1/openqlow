plugins {
    kotlin("jvm") version "2.0.21"
}

// 【重要】このモジュールは Android の API を一切使いません。
// 理由: 実機やAndroid SDKが無くてもテストできるようにするためです。
// iOS版でも同じ仕様をそのまま移植できます。
// 依存ライブラリは原則ゼロ。増やすときはライセンス(Apache-2.0/MIT/BSD)を必ず確認すること。
repositories { mavenCentral() }

dependencies {
    testImplementation(kotlin("test"))
}

kotlin { jvmToolchain(21) }

tasks.test { useJUnitPlatform() }
