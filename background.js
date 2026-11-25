/* Maker File Previewer — background service worker.
   Jobs: create the right-click menu item once; open the viewer tab when
   the toolbar icon is clicked; for a right-clicked link, ask for one-time
   access to that site (optional host permission), fetch the file in the
   worker, and hand the bytes to the viewer tab. No other network use. */

const VIEWER_URL = chrome.runtime.getURL("viewer/index.html");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "preview-file",
    title: "Preview with Maker File Previewer",
    contexts: ["link"],
    targetUrlPatterns: ["*://*/*.dxf", "*://*/*.DXF", "*://*/*.stl", "*://*/*.STL"],
  });
});

chrome.action.onClicked.addListener(() => {
  openViewerTab();
});

function openViewerTab(extraQuery) {
  const url = extraQuery ? VIEWER_URL + extraQuery : VIEWER_URL;
  return new Promise((resolve) => {
    chrome.tabs.query({ url: VIEWER_URL + "*" }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true, url });
        chrome.windows.update(tabs[0].windowId, { focused: true });
        resolve(tabs[0]);
      } else {
        chrome.tabs.create({ url }, resolve);
      }
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "preview-file" || !info.linkUrl) return;
  const url = info.linkUrl;
  const tab = await openViewerTab();
  const origin = new URL(url).origin + "/*";

  // file:// links need the "Allow access to file URLs" toggle; the
  // viewer page fetches the URL itself (the ?file= param covers the
  // case where the tab was just created and a message would be missed).
  if (url.startsWith("file://")) {
    openViewerTab("?file=" + encodeURIComponent(url));
    return;
  }

  const hasPermission = await chrome.permissions.contains({ origins: [origin] });
  if (!hasPermission) {
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) {
      chrome.tabs.sendMessage(tab.id, {
        type: "preview-error",
        kind: "permission-declined",
        url,
      }).catch(() => {});
      return;
    }
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("http-" + res.status);
    const bytes = new Uint8Array(await res.arrayBuffer());
    // chrome.storage.session has a ~10 MB quota; large files go through
    // the drag-and-drop flow instead of failing silently here.
    if (bytes.length > 8 * 1024 * 1024) {
      chrome.tabs.sendMessage(tab.id, {
        type: "preview-error",
        kind: "too-big-for-link",
        url,
      }).catch(() => {});
      return;
    }
    await chrome.storage.session.set({
      pendingPreview: { url, bytes: Array.from(bytes), at: Date.now() },
    });
    chrome.tabs.sendMessage(tab.id, { type: "preview-pending" }).catch(() => {});
  } catch (err) {
    chrome.tabs.sendMessage(tab.id, {
      type: "preview-error",
      kind: "fetch-failed",
      url,
    }).catch(() => {});
  }
});
