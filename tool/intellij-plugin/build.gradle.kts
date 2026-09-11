import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
  kotlin("jvm") version "2.2.20"
  id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = "com.brainridge.aidevworkflow"
version = providers.gradleProperty("pluginVersion").get()

repositories {
  mavenCentral()
  intellijPlatform { defaultRepositories() }
}

dependencies {
  intellijPlatform {
    create(
      providers.gradleProperty("platformType").get(),
      providers.gradleProperty("platformVersion").get(),
    )
    // TerminalToolWindowManager ships in the bundled Terminal plugin rather than
    // in the platform itself, so IntellijHost.toTerminal does not compile without
    // this. plugin.xml declares the matching runtime <depends>.
    bundledPlugin("org.jetbrains.plugins.terminal")
    // The form-instrumentation compiler `:instrumentCode` runs on. Not pulled in
    // by create(), so without it buildPlugin fails after a clean compile.
    instrumentationTools()
    testFramework(TestFrameworkType.Platform)
  }
  implementation(kotlin("stdlib"))
  testImplementation(kotlin("test"))
}

kotlin { jvmToolchain(21) }

intellijPlatform {
  pluginConfiguration {
    version = providers.gradleProperty("pluginVersion")
    ideaVersion {
      sinceBuild = providers.gradleProperty("pluginSinceBuild")
      untilBuild = providers.gradleProperty("pluginUntilBuild")
    }
  }
}

/**
 * The sidecar: the same JavaScript the VS Code extension runs.
 *
 * The Kotlin plugin owns no workflow logic at all — it spawns this bundle and
 * speaks JSON-RPC to it. Building it here rather than committing a second copy
 * is what makes "change it once" true rather than aspirational: there is no
 * second copy to forget. See spec Section 19.
 */
val buildCore by tasks.registering(Exec::class) {
  workingDir = rootProject.file("../..")
  // The same two scripts the .vsix build runs. Neither plugin owns a renderer
  // or an engine of its own; both consume core's single build.
  commandLine("npm", "run", "build:core")
  inputs.dir(rootProject.file("../core/src"))
  inputs.dir(rootProject.file("../core/webview"))
  outputs.dir(rootProject.file("../core/out"))
  outputs.dir(layout.buildDirectory.dir("sidecar"))
}

/**
 * The renderer bundle, the sidecar bundle and the shared content are copied into
 * the plugin jar's resources. Same files, same content, same workflows as the
 * .vsix — because they are literally the same files.
 */
val bundleCore by tasks.registering(Copy::class) {
  dependsOn(buildCore)
  into(layout.buildDirectory.dir("generated-resources/core"))

  from(layout.buildDirectory.dir("sidecar")) { into("sidecar") }
  // RendererPanel reads these from /core/renderer/ on the classpath.
  from(rootProject.file("../core/out/renderer")) {
    into("renderer")
    exclude("*.map", "dev.js")
  }
  from(rootProject.file("../core/workflows")) { into("workflows") }
  from(rootProject.file("../core/prompts")) { into("prompts") }
  from(rootProject.file("../core/examples")) { into("examples") }

  /**
   * A list of everything above, as one resource.
   *
   * The sidecar is a separate process and cannot read the plugin's classpath,
   * so `BundledContent` unpacks this tree to disk. Enumerating a jar from
   * inside the IDE is not reliable — `codeSource` is null under the platform's
   * own class loader — so the build records the file list instead.
   */
  doLast {
    val root = layout.buildDirectory.dir("generated-resources/core").get().asFile
    val files = root.walkTopDown()
      .filter { it.isFile && it.name != "manifest.txt" }
      .map { it.relativeTo(root).path }
      .sorted()
      .toList()
    root.resolve("manifest.txt").writeText(files.joinToString("\n", postfix = "\n"))
    logger.lifecycle("bundled ${files.size} core files")
  }
}

sourceSets["main"].resources.srcDir(layout.buildDirectory.dir("generated-resources"))
tasks.named("processResources") { dependsOn(bundleCore) }
