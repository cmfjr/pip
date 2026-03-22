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
      const candidate = findCurrentPageVideo();
      if (isUsableVideo(candidate)) {
        return candidate;
      }

      await sleep(150);
    }

    return findCurrentPageVideo();
  }

  function findCurrentPageVideo() {
    if (window.location.pathname === "/watch") {
      return findWatchPageVideo();
    }

    if (window.location.pathname.startsWith("/shorts/")) {
      return findShortsPageVideo();
    }

    return null;
  }

  function findWatchPageVideo() {
    const activeWatchPage = findActiveElement("ytd-watch-flexy");
    if (!activeWatchPage) {
      return null;
    }

    return pickVideoFromContainer(activeWatchPage, [
      "#movie_player video.html5-main-video",
      "#movie_player .html5-video-container video",
      "video.html5-main-video"
    ]);
  }

  function findShortsPageVideo() {
    const activeShortsRenderer = findActiveShortsRenderer();
    if (!activeShortsRenderer) {
      return null;
    }

    return pickVideoFromContainer(activeShortsRenderer, [
      "#shorts-player video.html5-main-video",
      "video.html5-main-video",
      "video"
    ]);
  }

  function findActiveShortsRenderer() {
    const activeRenderers = [
      ...document.querySelectorAll(
        "ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active]"
      )
    ].filter((element) => isElementActive(element));

    if (activeRenderers.length) {
      activeRenderers.sort((left, right) => {
        const leftScore = scoreActiveContainer(left);
        const rightScore = scoreActiveContainer(right);
        return rightScore - leftScore;
      });

      return activeRenderers[0];
    }

    const activeShortsPage = findActiveElement("ytd-shorts");
    if (!activeShortsPage) {
      return null;
    }

    const visibleRenderers = [
      ...activeShortsPage.querySelectorAll("ytd-reel-video-renderer")
    ].filter((element) => isElementActive(element));
    if (!visibleRenderers.length) {
      return null;
    }

    visibleRenderers.sort((left, right) => {
      const leftScore = scoreElementVisibility(left);
      const rightScore = scoreElementVisibility(right);
      return rightScore - leftScore;
    });

    return visibleRenderers[0];
  }

  function findActiveElement(selector) {
    const candidates = [...document.querySelectorAll(selector)].filter((element) =>
      isElementActive(element)
    );
    if (!candidates.length) {
      return null;
    }

    candidates.sort((left, right) => {
      const leftScore = scoreActiveContainer(left);
      const rightScore = scoreActiveContainer(right);
      return rightScore - leftScore;
    });

    return candidates[0];
  }

  function pickVideoFromContainer(container, selectors) {
    const candidates = [];

    for (const selector of selectors) {
      candidates.push(...container.querySelectorAll(selector));
    }

    const rankedVideos = rankContainerVideos(candidates);
    return rankedVideos[0] ?? null;
  }

  function rankContainerVideos(videos) {
    return [...new Set(videos)]
      .filter((video) => video.isConnected)
      .filter((video) => !isElementHidden(video))
      .map((video) => ({
        video,
        score: scoreContainerVideo(video)
      }))
      .sort((left, right) => right.score - left.score)
      .map(({ video }) => video);
  }

  function scoreContainerVideo(video) {
    const rect = video.getBoundingClientRect();
    const area = Math.max(rect.width, 0) * Math.max(rect.height, 0);
    const visible = rect.width > 0 && rect.height > 0;
    const readyBonus = video.readyState > 0 ? 2000000 : 0;
    const mainVideoBonus = video.classList.contains("html5-main-video")
      ? 1000000
      : 0;
    const visibleBonus = visible ? 500000 : 0;
    const currentTimeBonus = video.currentTime > 0 ? 1000 : 0;
    const playingBonus = !video.paused && !video.ended ? 250000 : 0;
    const endedPenalty = video.ended ? -1000000 : 0;

    return (
      area +
      readyBonus +
      mainVideoBonus +
      visibleBonus +
      currentTimeBonus +
      playingBonus +
      endedPenalty
    );
  }

  function isUsableVideo(video) {
    return Boolean(video) && video.readyState > 0 && !isElementHidden(video);
  }

  function isElementActive(element) {
    return Boolean(element?.isConnected) && !isElementHidden(element);
  }

  function isElementHidden(element) {
    for (let current = element; current; current = current.parentElement) {
      if (current.hidden) {
        return true;
      }

      if (current.getAttribute("aria-hidden") === "true") {
        return true;
      }

      const style = window.getComputedStyle(current);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.contentVisibility === "hidden" ||
        style.opacity === "0"
      ) {
        return true;
      }
    }

    return false;
  }

  function scoreActiveContainer(element) {
    const visibilityScore = scoreElementVisibility(element);
    const bestVideoScore = [...element.querySelectorAll("video")].reduce(
      (best, video) =>
        Math.max(
          best,
          isElementHidden(video) ? 0 : scoreContainerVideo(video)
        ),
      0
    );

    return visibilityScore + bestVideoScore;
  }

  function scoreElementVisibility(element) {
    const rect = element.getBoundingClientRect();
    const area = Math.max(rect.width, 0) * Math.max(rect.height, 0);
    const viewportOverlap =
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
        ? 500000
        : 0;

    return area + viewportOverlap;
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
