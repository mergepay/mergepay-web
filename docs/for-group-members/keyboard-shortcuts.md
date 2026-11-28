# Keyboard Shortcuts

Mergepay can be used entirely from the keyboard. Press **?** on any page, or choose **Keyboard shortcuts** in the sidebar, to see this list in the app. The in-app list also tells you which shortcuts work on the page you are on.

| Keys | Action | Where it works |
| --- | --- | --- |
| `?` | Show the keyboard shortcuts list | Anywhere |
| `Ctrl` + `K` (Windows/Linux) or `⌘` + `K` (Mac) | Open the command palette | Signed-in pages |
| `N` | Add an expense | A group's page |
| `G` | Switch group | Signed-in pages |
| `W` | Connect your Freighter wallet | Sign-in page |

## When shortcuts don't fire

Shortcuts are designed never to get in the way of normal typing or of other keyboard controls:

- **While you type.** Nothing happens when focus is in a text field, text area, dropdown, or rich-text editor. Pressing `N` in an expense title types an "n".
- **Inside menus and lists.** Letter keys jump between menu items (type-ahead) instead of triggering shortcuts.
- **While a dialog is open.** The dialog owns the keyboard. Press `Escape` to close it first.
- **With modifier keys.** `N` works, but `Ctrl` + `N` or `Shift` + `N` does not, so browser and screen-reader commands keep working.

## Turning off single-key shortcuts

`?`, `N`, `G` and `W` are single-key shortcuts. If you use speech input, or tend to press keys by accident, open the shortcuts list and untick **Single-key shortcuts**. Your choice is saved in this browser. `Ctrl`/`⌘` + `K` and the **Keyboard shortcuts** button in the sidebar keep working.

## Screen readers

- The **Add Expense** and **Connect Freighter** buttons announce their shortcut through `aria-keyshortcuts`.
- The shortcuts list and the group switcher are modal dialogs. Focus moves into them when they open, `Tab` stays inside them, and focus returns to where you were when they close.
- In the group switcher, the current group is announced as "current group".
