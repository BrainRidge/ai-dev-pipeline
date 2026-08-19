"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebviewBridge = void 0;
/**
 * The ONLY module permitted to call postMessage. One seam means one place to
 * log and one place to test. Enforced by ESLint. See spec Section 5.
 */
/** Generic over the descriptor so the same seam serves the panel's workflow
 *  stepper and the sidebar's setup form. */
class WebviewBridge {
    webview;
    handler;
    /**
     * The webview's script loads asynchronously, so a render posted immediately
     * after setting the HTML arrives before anything is listening and is lost —
     * leaving a blank panel. We keep the latest descriptor and flush it when the
     * webview announces itself with `ready`.
     */
    lastDescriptor;
    webviewReady = false;
    /** Takes a bare Webview so the same seam serves the panel and the sidebar. */
    constructor(webview) {
        this.webview = webview;
        this.webview.onDidReceiveMessage((msg) => {
            if (msg.type === 'ready') {
                this.webviewReady = true;
                if (this.lastDescriptor)
                    this.post({ type: 'render', descriptor: this.lastDescriptor });
                return;
            }
            if (msg.type === 'action' && this.handler)
                this.handler(msg);
        });
    }
    /**
     * A hidden webview discards its DOM; when it comes back the script reloads
     * and sends `ready` again. Owners call this on hide so that flush replays the
     * current step.
     */
    resetReady() {
        this.webviewReady = false;
    }
    onAction(cb) {
        this.handler = cb;
    }
    render(descriptor) {
        this.lastDescriptor = descriptor;
        if (this.webviewReady)
            this.post({ type: 'render', descriptor });
    }
    post(message) {
        void this.webview.postMessage(message);
    }
    progress(stepId, message) {
        this.post({ type: 'progress', stepId, message });
    }
    error(stepId, message, recoverable) {
        this.post({ type: 'error', stepId, message, recoverable });
    }
    html(scriptUri, styleUri, nonce) {
        const src = this.webview.cspSource;
        return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${src}; script-src 'nonce-${nonce}'; style-src ${src};">
<link rel="stylesheet" href="${styleUri.toString()}">
</head><body><div id="root"></div>
<script nonce="${nonce}" src="${scriptUri.toString()}"></script></body></html>`;
    }
}
exports.WebviewBridge = WebviewBridge;
