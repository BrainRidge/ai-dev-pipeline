plugins {
  // Lets `jvmToolchain(21)` provision a JDK 21 rather than falling back to
  // whatever JVM Gradle happens to be running on. Without it, a developer on a
  // newer JDK gets "Internal compiler error: IllegalArgumentException: 25.0.2"
  // from the Kotlin compiler, which says nothing about the actual problem.
  id("org.gradle.toolchains.foojay-resolver-convention") version "0.8.0"
}

rootProject.name = "ai-dev-workflow-intellij"
