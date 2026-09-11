package com.brainridge.aidevworkflow.ui

import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.ui.ColorUtil
import com.intellij.ui.JBColor
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import java.awt.Color
import javax.swing.UIManager

/**
 * The IDE's colours, written out as the variables the renderer's stylesheet asks
 * for.
 *
 * `tool/core/webview/style.css` is styled entirely in `--vscode-*` variables,
 * which the VS Code webview host defines for free — that is how light, dark and
 * high-contrast all work there without a second stylesheet. JCEF defines none of
 * them, so every colour fell back: the ones written with a fallback to a dark
 * value, and the ones without to nothing at all. On a dark IDE the pane was
 * black text on black.
 *
 * So this is the JetBrains half of that host contract. The stylesheet is not
 * forked and not touched — the same file, the same variable names, filled in
 * from `UIManager` instead. A theme switch re-runs this and replaces the block;
 * see `RendererPanel`. Nothing here is a constant that has to match a particular
 * theme: every value is read from the look and feel in use, so a third-party
 * theme is themed too.
 *
 * See spec Section 19.
 */
object IdeTheme {

  /** The `<style>` block's id, so an update can find and replace it. */
  const val STYLE_ID = "ide-theme"

  /** What the page should paint before the document has loaded. */
  fun pageBackground(): String = hex(background())

  /**
   * The whole variable block, as CSS.
   *
   * `color-scheme` is the one rule here that is not a variable: without it
   * Chromium draws checkboxes, radios, select popups and scrollbars in its own
   * light palette however the rest of the page is coloured, which on a dark IDE
   * is the other half of the same complaint.
   */
  fun css(): String {
    val bg = background()
    val fg = UIUtil.getLabelForeground()
    val dark = ColorUtil.isDark(bg)
    val widget = layer(bg, dark)
    val border = ui("Component.borderColor", JBColor.border())
    val focus = JBUI.CurrentTheme.Focus.focusColor()
    val input = ui("TextField.background", UIUtil.getTextFieldBackground())
    val secondary = ui("Button.startBackground", widget)
    val errorFg = ui("Label.errorForeground", if (dark) Color(0xFF, 0x6B, 0x68) else Color(0xC7, 0x22, 0x2D))
    val editorScheme = EditorColorsManager.getInstance().globalScheme

    return """
      :root {
        color-scheme: ${if (dark) "dark" else "light"};

        --vscode-font-family: ${fontFamily()};
        --vscode-font-size: ${UIUtil.getLabelFont().size}px;
        --vscode-foreground: ${hex(fg)};
        --vscode-editor-background: ${hex(bg)};
        --vscode-sideBar-background: ${hex(bg)};
        --vscode-descriptionForeground: ${hex(UIUtil.getContextHelpForeground())};

        --vscode-focusBorder: ${hex(focus)};
        --vscode-panel-border: ${hex(border)};
        --vscode-editorWidget-background: ${hex(widget)};
        --vscode-editor-selectionBackground: ${rgba(focus, 0.18)};
        --vscode-textCodeBlock-background: ${hex(layer(widget, dark))};

        --vscode-badge-background: ${hex(ui("ProgressBar.trackColor", widget))};
        --vscode-badge-foreground: ${hex(fg)};

        --vscode-input-background: ${hex(input)};
        --vscode-input-foreground: ${hex(ui("TextField.foreground", fg))};
        --vscode-input-border: ${hex(border)};

        --vscode-button-background: ${hex(ui("Button.default.startBackground", focus))};
        --vscode-button-foreground: ${hex(ui("Button.default.foreground", onAccent(focus)))};
        /* Not decoration: in a dark theme the IDE's own button fill is within a
           shade of the panel behind it, and a secondary button with no border
           reads as plain text. The platform draws that edge; so do we. */
        --vscode-button-border: ${hex(ui("Button.startBorderColor", border))};
        --vscode-button-secondaryBackground: ${hex(secondary)};
        --vscode-button-secondaryForeground: ${hex(ui("Button.foreground", fg))};
        --vscode-button-secondaryHoverBackground: ${hex(layer(secondary, dark))};

        --vscode-inputValidation-errorForeground: ${hex(errorFg)};
        --vscode-inputValidation-errorBackground: ${rgba(errorFg, if (dark) 0.22 else 0.12)};
        --vscode-inputValidation-errorBorder: ${rgba(errorFg, 0.7)};
        --vscode-inputValidation-warningForeground: ${hex(fg)};
        --vscode-inputValidation-warningBackground: ${rgba(chart("orange", dark), if (dark) 0.22 else 0.14)};
        --vscode-inputValidation-warningBorder: ${rgba(chart("orange", dark), 0.7)};

        --vscode-editor-font-family: "${editorScheme.editorFontName}", monospace;
        --vscode-editor-font-size: ${editorScheme.editorFontSize}px;

        --vscode-charts-green: ${hex(chart("green", dark))};
        --vscode-charts-blue: ${hex(chart("blue", dark))};
        --vscode-charts-orange: ${hex(chart("orange", dark))};
        --vscode-charts-purple: ${hex(chart("purple", dark))};
      }
    """.trimIndent()
  }

  /**
   * The tool window's own background, not the editor's: this page is a tool
   * window, and a pane that matched the editor would be the one panel in the
   * IDE that did not match its neighbours.
   */
  private fun background(): Color = UIUtil.getPanelBackground()

  /**
   * One step away from the background — a card, a code block, a badge.
   *
   * Which direction that is depends on the theme, which is why it is computed
   * from the background's own luminance rather than from the theme's name.
   */
  private fun layer(base: Color, dark: Boolean): Color =
    if (dark) ColorUtil.brighter(base, 1) else ColorUtil.darker(base, 1)

  /** Readable text on a filled accent button, whichever accent the theme uses. */
  private fun onAccent(accent: Color): Color =
    if (ColorUtil.isDark(accent)) Color.WHITE else Color.BLACK

  /**
   * The status colours the diagram uses. These are the one place a value is
   * chosen rather than read: the platform has no palette for "this step passed",
   * and the editor's own scheme keys are about syntax, not status.
   */
  private fun chart(name: String, dark: Boolean): Color = when (name) {
    "green" -> if (dark) Color(0x5F, 0xAD, 0x65) else Color(0x2E, 0x7D, 0x32)
    "blue" -> if (dark) Color(0x54, 0x9D, 0xD8) else Color(0x1F, 0x6F, 0xB5)
    "orange" -> if (dark) Color(0xD9, 0x8E, 0x3F) else Color(0xB2, 0x6A, 0x14)
    else -> if (dark) Color(0xA3, 0x7A, 0xD8) else Color(0x74, 0x4C, 0xA8)
  }

  /**
   * The IDE's UI font, with fallbacks after it: on macOS the family reads back
   * as `.AppleSystemUIFont`, which Chromium will not resolve.
   */
  private fun fontFamily(): String = "\"${UIUtil.getLabelFont().family}\", system-ui, sans-serif"

  private fun ui(key: String, fallback: Color): Color = UIManager.getColor(key) ?: fallback

  private fun hex(color: Color): String = String.format("#%02x%02x%02x", color.red, color.green, color.blue)

  private fun rgba(color: Color, alpha: Double): String =
    "rgba(${color.red}, ${color.green}, ${color.blue}, $alpha)"
}
