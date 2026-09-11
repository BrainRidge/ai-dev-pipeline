import * as vscode from 'vscode'
import type { ActionMessage, Transport } from '@ai-dev-pipeline/core'

/**
 * The only module in the VS Code host permitted to call `postMessage`.
 * `WebviewBridge` owns the protocol; this owns the pipe. See spec Sections 5
 * and 19.
 */
export function vscodeTransport(webview: vscode.Webview): Transport {
  return {
    post(message) {
      void webview.postMessage(message)
    },
    onMessage(handler) {
      webview.onDidReceiveMessage((msg: { type: string } & ActionMessage) => handler(msg))
    },
  }
}

/**
 * The page the renderer loads. VS Code-specific because the CSP is written
 * against `webview.cspSource` and the URIs are `asWebviewUri` rewrites; the
 * IntelliJ host serves the same renderer bundle from its own HTML.
 */
export function panelHtml(
  webview: vscode.Webview,
  scriptUri: vscode.Uri,
  styleUri: vscode.Uri,
  nonce: string,
): string {
  const src = webview.cspSource
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${src}; script-src 'nonce-${nonce}'; style-src ${src};">
<link rel="stylesheet" href="${styleUri.toString()}">
</head><body><div id="root"></div>
<script nonce="${nonce}" src="${scriptUri.toString()}"></script></body></html>`
}
