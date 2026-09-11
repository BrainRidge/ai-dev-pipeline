package com.brainridge.aidevworkflow.sidecar

import com.intellij.openapi.diagnostic.logger
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.TimeUnit

/**
 * Finds a Node the sidecar can run on.
 *
 * VS Code never had to answer this question — its extension host *is* Node. A
 * JVM plugin has to look. A setting would be the obvious answer and the wrong
 * one: `npm run check:parity` asserts that both plugins expose the same
 * settings, and VS Code has no use for a Node path, so adding it to one side
 * fails the gate and adding it to both puts a dead control in the VS Code UI.
 *
 * The IDE is usually launched from the desktop rather than a shell, so `PATH`
 * here is not the developer's login `PATH` — which is why the well-known
 * locations below are checked too, nvm's layout included. See spec Section 19.
 */
object NodeDiscovery {

  /** The minimum core is built for: `esbuild` targets node20. */
  const val MINIMUM_MAJOR = 20

  data class Found(val path: String, val version: String)

  sealed interface Result {
    data class Ok(val node: Found) : Result
    /** Nothing runnable was found; [message] is shown in the pane. */
    data class Missing(val message: String) : Result
  }

  fun find(): Result {
    val seen = LinkedHashSet<String>()
    for (candidate in candidates()) {
      if (!seen.add(candidate)) continue
      val version = versionOf(candidate) ?: continue
      val major = majorOf(version) ?: continue
      if (major >= MINIMUM_MAJOR) return Result.Ok(Found(candidate, version))
      LOG.info("ignoring $candidate: node $version is older than $MINIMUM_MAJOR")
    }
    return Result.Missing(
      "Node $MINIMUM_MAJOR or newer is required to run the workflow engine, and none " +
        "was found. Install Node, or make it available on the PATH the IDE is " +
        "launched with, then reopen this panel.",
    )
  }

  private fun candidates(): List<String> {
    val out = mutableListOf<String>()

    // Whatever PATH this process actually has, first.
    System.getenv("PATH")?.split(File.pathSeparator)?.forEach { dir ->
      if (dir.isNotBlank()) out += Path.of(dir, "node").toString()
    }

    // Then the places a desktop-launched IDE cannot see.
    out += listOf(
      "/opt/homebrew/bin/node",
      "/usr/local/bin/node",
      "/usr/bin/node",
      "/opt/local/bin/node",
    )

    val home = System.getProperty("user.home") ?: return out
    // nvm keeps every version side by side, newest last after sorting.
    val nvm = Path.of(home, ".nvm", "versions", "node")
    if (Files.isDirectory(nvm)) {
      runCatching {
        Files.list(nvm).use { stream ->
          stream
            .map { it.resolve("bin").resolve("node").toString() }
            .sorted()
            .toList()
            .reversed()
            .forEach { out += it }
        }
      }
    }
    out += Path.of(home, ".volta", "bin", "node").toString()
    out += Path.of(home, ".asdf", "shims", "node").toString()
    out += Path.of(home, ".local", "bin", "node").toString()
    return out
  }

  /** `node --version`, or null if it is not there or will not run. */
  private fun versionOf(path: String): String? {
    if (!Files.isExecutable(Path.of(path))) return null
    return runCatching {
      val process = ProcessBuilder(path, "--version").redirectErrorStream(true).start()
      val text = process.inputStream.bufferedReader().readText().trim()
      // A hung interpreter must not hang the panel that is waiting to draw.
      if (!process.waitFor(5, TimeUnit.SECONDS)) {
        process.destroyForcibly()
        return null
      }
      if (process.exitValue() != 0) null else text
    }.getOrNull()
  }

  /** "v22.3.0" -> 22. */
  fun majorOf(version: String): Int? =
    Regex("""^v?(\d+)""").find(version.trim())?.groupValues?.get(1)?.toIntOrNull()

  private val LOG = logger<NodeDiscovery>()
}
