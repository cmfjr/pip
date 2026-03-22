chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) {
    return;
  }

  try {
    // Run in the page's main world so the PiP request targets the real page
    // document and the page's actual <video> element.
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: togglePictureInPictureOnPage
    });

    const nextTitle = result?.ok
      ? result.inPictureInPicture
        ? "Exit YouTube PiP"
        : "Open YouTube PiP"
      : "Toggle YouTube PiP";

    await chrome.action.setTitle({
      tabId: tab.id,
      title: formatTitle(result)
    });
    await chrome.action.setBadgeBackgroundColor({
      tabId: tab.id,
      color: result?.ok ? "#0B8043" : "#B3261E"
    });
    await chrome.action.setBadgeText({
      tabId: tab.id,
      text: result?.ok ? (result.inPictureInPicture ? "ON" : "OFF") : "ERR"
    });

    // Restore the default title after a short delay so the action stays readable.
    setTimeout(async () => {
      try {
        await chrome.action.setTitle({ tabId: tab.id, title: nextTitle });
      } catch (error) {
        // Ignore when the tab disappears before cleanup runs.
      }
    }, 2500);
  } catch (error) {
    await chrome.action.setBadgeBackgroundColor({
      tabId: tab.id,
      color: "#B3261E"
    });
    await chrome.action.setBadgeText({
      tabId: tab.id,
      text: "ERR"
    });
    await chrome.action.setTitle({
      tabId: tab.id,
      title: `Toggle YouTube PiP: ${error.message}`
    });
  }
});

function formatTitle(result) {
  if (!result) {
    return "Toggle YouTube PiP";
  }

  if (result.ok) {
    return result.message;
  }

  return `Toggle YouTube PiP: ${result.message}`;
}

async function togglePictureInPictureOnPage() {
  // Keep these helpers inside the injected function because executeScript()
  // serializes this function body into the page.
  if (!isSupportedPage()) {
    return fail(
      "Open a YouTube watch page or Shorts page before using the extension."
    );
  }

  if (!document.pictureInPictureEnabled) {
    return fail("Picture-in-Picture is not available in this tab.");
  }

  const video = await findBestVideoElement();
  if (!video) {
    return fail("No YouTube video was ready yet. Start the video and try again.");
  }

  if (video.disablePictureInPicture) {
    return fail("This video is currently marked as unavailable for PiP.");
  }

  try {
    const activeElement = document.pictureInPictureElement;
    if (activeElement === video) {
      await document.exitPictureInPicture();
      return success("Closed the floating PiP window.", false);
    }

    await video.requestPictureInPicture();
    return success("Opened the floating PiP window.", true);
  } catch (error) {
    return fail(normalizeError(error));
  }

  function isSupportedPage() {
    const { hostname, pathname } = window.location;
    const isYouTubeHost =
      hostname === "www.youtube.com" ||
      hostname === "youtube.com" ||
      hostname === "m.youtube.com";

    if (!isYouTubeHost) {
      return false;
    }

    return pathname === "/watch" || pathname.startsWith("/shorts/");
  }

  async function findBestVideoElement() {
    const deadline = Date.now() + 2000;

    while (Date.now() < deadline) {
      const candidate = pickBestVideoCandidate();
      if (candidate && candidate.readyState > 0) {
        return candidate;
      }

      await sleep(150);
    }

    return pickBestVideoCandidate();
  }

  function pickBestVideoCandidate() {
    const videos = [...document.querySelectorAll("video")];
    if (!videos.length) {
      return null;
    }

    const ranked = videos
      .filter((video) => video.isConnected)
      .map((video) => ({
        video,
        score: scoreVideo(video)
      }))
      .sort((left, right) => right.score - left.score);

    return ranked[0]?.video ?? null;
  }

  function scoreVideo(video) {
    const rect = video.getBoundingClientRect();
    const area = Math.max(rect.width, 0) * Math.max(rect.height, 0);
    const style = window.getComputedStyle(video);
    const visible =
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0";
    const readyBonus = video.readyState > 0 ? 2000000 : 0;
    const mainVideoBonus = video.classList.contains("html5-main-video")
      ? 1000000
      : 0;
    const visibleBonus = visible ? 500000 : 0;
    const currentTimeBonus = video.currentTime > 0 ? 1000 : 0;

    return area + readyBonus + mainVideoBonus + visibleBonus + currentTimeBonus;
  }

  function normalizeError(error) {
    if (!error) {
      return "An unknown error occurred while toggling PiP.";
    }

    if (error.name === "NotAllowedError") {
      return "Chrome rejected the PiP request. Try clicking the video once, then click the extension again.";
    }

    if (error.name === "InvalidStateError") {
      return "The video is not ready for PiP yet. Let it start loading, then try again.";
    }

    if (error.message) {
      return error.message;
    }

    return String(error);
  }

  function success(message, inPictureInPicture) {
    return {
      ok: true,
      message,
      inPictureInPicture
    };
  }

  function fail(message) {
    return {
      ok: false,
      message,
      inPictureInPicture: false
    };
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
}
