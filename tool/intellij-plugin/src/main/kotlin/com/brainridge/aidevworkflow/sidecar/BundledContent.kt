package com.brainridge.aidevworkflow.sidecar

import com.intellij.openapi.application.PathManager
import com.intellij.openapi.diagnostic.logger
import java.nio.file.Files
import java.nio.file.Path

/**
 * The bundled engine and content, on disk.
 *
 * `RendererPanel` reads the renderer bundle straight off the classpath, because
 * it runs in this JVM. The sidecar cannot: it is a separate Node process, and
 * `AI_DEV_BUNDLED_DIR` has to be a real directory it can `readFile` from. So
 * the `core/` tree is unpacked out of the plugin's resources once per version.
 *
 * What to unpack comes from `core/manifest.txt`, which the Gradle build writes.
 * Enumerating the jar at runtime was tried first and does not work: under the
 * platform's own class loader `codeSource` is null, so the unpack failed with
 * nothing in the log to say why. See spec Section 19.
 *
 * Keyed by version so an upgrade cannot read a stale bundle, and kept in the
 * IDE's system path rather than a temp dir so it survives a restart.
 */
object BundledContent {

  /** The directory to pass as `AI_DEV_BUNDLED_DIR`, or null if unpacking failed. */
  fun ensure(version: String): Path? {
    val target = Path.of(PathManager.getSystemPath(), "ai-dev-workflow", version)
    val marker = target.resolve(".unpacked")
    if (Files.isRegularFile(marker)) return target

    val manifest = read("$ROOT/$MANIFEST")
      ?: return null.also { LOG.warn("$ROOT/$MANIFEST is missing from the plugin resources") }

    val names = manifest.lines().map(String::trim).filter(String::isNotEmpty)
    if (names.isEmpty()) return null.also { LOG.warn("$ROOT/$MANIFEST is empty") }

    return runCatching {
      for (name in names) {
        val stream = javaClass.getResourceAsStream("/$ROOT/$name")
          ?: error("$name is listed in $MANIFEST but not present in the plugin")
        val out = target.resolve(name)
        Files.createDirectories(out.parent)
        stream.use { input -> Files.newOutputStream(out).use(input::copyTo) }
      }
      Files.writeString(marker, version)
      LOG.info("unpacked ${names.size} bundled files to $target")
      target
    }.onFailure { LOG.warn("could not unpack the bundled content to $target", it) }.getOrNull()
  }

  /** The sidecar bundle inside the unpacked tree. */
  fun sidecarScript(bundled: Path): Path = bundled.resolve("sidecar").resolve("sidecar.js")

  private fun read(resource: String): String? =
    javaClass.getResourceAsStream("/$resource")?.use { it.readBytes().decodeToString() }

  private const val ROOT = "core"
  private const val MANIFEST = "manifest.txt"
  private val LOG = logger<BundledContent>()
}
