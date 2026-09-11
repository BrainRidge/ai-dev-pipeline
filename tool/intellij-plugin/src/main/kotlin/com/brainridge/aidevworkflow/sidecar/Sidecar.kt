package com.brainridge.aidevworkflow.sidecar

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.diagnostic.logger
import java.io.BufferedReader
import java.io.BufferedWriter
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * The workflow engine, in a child process.
 *
 * The plugin owns no workflow logic: it spawns the bundle built from
 * `tool/core` and speaks line-delimited JSON-RPC to it over stdio. A workflow
 * bug is therefore fixed once, in TypeScript, and both IDEs get the fix.
 * See spec Section 19.
 *
 * stdout is protocol. stderr is log output, and is forwarded to the IDE log
 * rather than parsed — the sidecar is careful never to print to stdout.
 */
class Sidecar(
  private val nodeExecutable: String,
  private val bundlePath: String,
  private val environment: Map<String, String>,
) : AutoCloseable {

  private val gson = Gson()
  private val nextId = AtomicInteger(1)
  private val pending = ConcurrentHashMap<Int, CompletableFuture<JsonObject>>()
  private val listeners = mutableListOf<(String, JsonObject) -> Unit>()

  private lateinit var process: Process
  private lateinit var writer: BufferedWriter

  fun start() {
    val builder = ProcessBuilder(nodeExecutable, bundlePath)
    builder.environment().putAll(environment)
    process = builder.start()
    writer = process.outputWriter()

    Thread({ readLoop(process.inputReader()) }, "ai-dev-sidecar-out").apply {
      isDaemon = true
      start()
    }
    Thread({ process.errorReader().forEachLine { LOG.info(it) } }, "ai-dev-sidecar-err").apply {
      isDaemon = true
      start()
    }
  }

  /** Fires for a `progress`, `error` or `render` push that no request asked for. */
  fun onEvent(listener: (event: String, payload: JsonObject) -> Unit) {
    listeners += listener
  }

  fun request(method: String, params: Any): CompletableFuture<JsonObject> {
    val id = nextId.getAndIncrement()
    val future = CompletableFuture<JsonObject>()
    pending[id] = future

    val body = JsonObject().apply {
      addProperty("id", id)
      addProperty("method", method)
      add("params", gson.toJsonTree(params))
    }

    synchronized(writer) {
      writer.write(gson.toJson(body))
      writer.newLine()
      writer.flush()
    }
    return future
  }

  private fun readLoop(reader: BufferedReader) {
    reader.forEachLine { line ->
      if (line.isBlank()) return@forEachLine
      val message = runCatching { gson.fromJson(line, JsonObject::class.java) }.getOrNull()
        ?: return@forEachLine LOG.warn("unparseable sidecar line: ${line.take(200)}")

      // No id means a push rather than an answer. See SidecarEvent in core.
      if (!message.has("id")) {
        val event = message.get("event")?.asString ?: return@forEachLine
        val payload = message.getAsJsonObject("payload") ?: JsonObject()
        listeners.forEach { it(event, payload) }
        return@forEachLine
      }

      val future = pending.remove(message.get("id").asInt) ?: return@forEachLine
      if (message.get("ok")?.asBoolean == true) {
        future.complete(message.getAsJsonObject("result") ?: JsonObject())
      } else {
        future.completeExceptionally(
          SidecarException(message.get("error")?.asString ?: "unknown sidecar error"),
        )
      }
    }
  }

  override fun close() {
    pending.values.forEach { it.completeExceptionally(SidecarException("sidecar closed")) }
    pending.clear()
    if (::process.isInitialized) process.destroy()
  }

  companion object {
    private val LOG = logger<Sidecar>()
  }
}

class SidecarException(message: String) : RuntimeException(message)
