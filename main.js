import './style.css';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { pokemonSpots } from './data/pokemonSpots.js';

const MAP_CENTER = [52.0693, 19.4803];
const MAP_ZOOM = 6;
const STORAGE_KEY = 'pokemonCaught';
const CAPTURE_RECORDS_KEY = 'pokemonCaptureRecords';
const ATTEMPT_COUNTS_KEY = 'pokemonAttemptCounts';
const LEGACY_PENDING_ATTEMPTS_KEY = 'pokemonPendingAttempts';
const CAPTURE_SEQUENCE_KEY = 'pokemonCaptureSequence';
const LAST_TRAVEL_SPOT_KEY = 'pokemonLastTravelSpot';
const INTRO_LEAD_MS = 1000;
const VIDEO_SEQUENCE_FALLBACK_MS = 8000;
const ROUTE_ANIMATION_MS = 2000;
const FLIGHT_ANIMATION_MS = 3200;
const ROUTE_API_URL = 'https://router.project-osrm.org/route/v1/walking';
const DEFAULT_WAITING_VIDEO = '/assets/Pokeballs/Normal/Waiting.mp4';
const DEFAULT_CATCH_VIDEO = '/assets/Pokeballs/Normal/Catch.mp4';
const DEFAULT_ESCAPE_VIDEO = '/assets/Pokeballs/Normal/Escape.mp4';
const PIDGEOT_ID = 6;
const PIDGEOT_FLIGHT_SPRITE = '/assets/Pokemons/Pidgeot/Pidgeot.png';
const REMOTE_TRAVEL_DISTANCE_KM = 160;
const AUDIO_CLIPS = {
  spawn: '/assets/Sounds/Spawn.mp3',
  battle: '/assets/Sounds/Battle.mp3',
  catch: '/assets/Sounds/Catch.mp3',
};
const RESULT_REVEAL_DELAY_MS = 1600;
const DEFAULT_SILHOUETTE_ASSET = '/assets/silhouette.png';
const REPLAYABLE_IDS = new Set([1]);
const LETTER_POOL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'webm', 'ogg', 'mov']);
const APP_BASE_URL = import.meta.env.BASE_URL || './';

const DIFFICULTY_PROFILES = {
  1: {
    label: 'Level 1 / Calm',
    letterCount: 8,
    totalDuration: 14000,
    betweenMin: 1500,
    betweenMax: 1800,
  },
  2: {
    label: 'Level 2 / Steady',
    letterCount: 10,
    totalDuration: 11500,
    betweenMin: 1200,
    betweenMax: 1450,
  },
  3: {
    label: 'Level 3 / Sharp',
    letterCount: 12,
    totalDuration: 9800,
    betweenMin: 950,
    betweenMax: 1150,
  },
  4: {
    label: 'Level 4 / Fast',
    letterCount: 14,
    totalDuration: 8600,
    betweenMin: 760,
    betweenMax: 980,
  },
  5: {
    label: 'Level 5 / Master',
    letterCount: 16,
    totalDuration: 7600,
    betweenMin: 620,
    betweenMax: 840,
  },
};

const elements = {
  mapContainer: document.getElementById('map'),
  progressCounter: document.getElementById('progress-counter'),
  currentTime: document.getElementById('current-time'),
  collectionList: document.getElementById('collection-list'),
  collectionHint: document.getElementById('collection-hint'),
  travelPrompt: document.getElementById('travel-prompt'),
  travelPromptTitle: document.getElementById('travel-prompt-title'),
  travelPromptText: document.getElementById('travel-prompt-text'),
  travelPromptRoute: document.getElementById('travel-prompt-route'),
  travelPromptConfirm: document.getElementById('travel-prompt-confirm'),
  travelPromptCancel: document.getElementById('travel-prompt-cancel'),
  captureOverlay: document.getElementById('capture-overlay'),
  captureVideo: document.getElementById('capture-video'),
  captureImage: document.getElementById('capture-image'),
  captureStars: document.getElementById('capture-stars'),
  captureStamp: document.getElementById('capture-stamp'),
  captureStampMessage: document.getElementById('capture-stamp-message'),
  captureStatusText: document.getElementById('capture-status-text'),
  captureStory: document.getElementById('capture-story'),
  ledReady: document.querySelector('.led-ready'),
  ledCapture: document.querySelector('.led-capture'),
  gameSection: document.getElementById('game-section'),
  gameDifficulty: document.getElementById('game-difficulty'),
  gameWords: document.getElementById('game-words'),
  sequenceDisplay: document.getElementById('sequence-display'),
  gameFeedback: document.getElementById('game-feedback'),
  timerFill: document.getElementById('timer-fill'),
  captureCloseBtn: document.getElementById('capture-close-btn'),
  retryArea: document.getElementById('retry-area'),
  retryButton: document.getElementById('retry-button'),
  sidebarInfo: document.getElementById('sidebar-info'),
  sidebarHint: document.getElementById('sidebar-hint'),
  sidebarNumber: document.getElementById('sidebar-number'),
  sidebarName: document.getElementById('sidebar-name'),
  sidebarSpecies: document.getElementById('sidebar-species'),
  sidebarType: document.getElementById('sidebar-type'),
  sidebarCategory: document.getElementById('sidebar-category'),
  sidebarHeight: document.getElementById('sidebar-height'),
  sidebarWeight: document.getElementById('sidebar-weight'),
  sidebarAbility: document.getElementById('sidebar-ability'),
  sidebarHabitat: document.getElementById('sidebar-habitat'),
  sidebarWeakness: document.getElementById('sidebar-weakness'),
  sidebarDifficulty: document.getElementById('sidebar-difficulty'),
  sidebarLocation: document.getElementById('sidebar-location'),
  sidebarStatus: document.getElementById('sidebar-status'),
  sidebarTime: document.getElementById('sidebar-time'),
  sidebarAttempts: document.getElementById('sidebar-attempts'),
  sidebarEntry: document.getElementById('sidebar-entry'),
  resetButton: document.getElementById('reset-progress-btn'),
};

const state = {
  map: null,
  markers: [],
  selectedSpot: null,
  caughtSet: new Set(),
  captureRecords: {},
  attemptCounts: {},
  captureSequence: [],
  lastTravelSpotId: null,
  catchGame: null,
  route: {
    baseLine: null,
    progressLine: null,
    walker: null,
    animationFrame: null,
  },
  capture: {
    stage: 'idle',
    sequenceTimeout: null,
    videoEndHandler: null,
    videoEndFallback: null,
    replayMode: false,
    infoRevealTimeout: null,
    successFxTimeout: null,
  },
  prompt: {
    resolver: null,
  },
  audioCtx: null,
  sounds: {
    battle: null,
    transient: null,
  },
};

init();

function init() {
  state.caughtSet = loadCaughtSet();
  state.captureRecords = loadCaptureRecords();
  state.attemptCounts = loadAttemptCounts();
  state.captureSequence = loadCaptureSequence();
  state.lastTravelSpotId = loadLastTravelSpotId();
  if (!state.captureSequence.length && state.caughtSet.size) {
    state.captureSequence = buildInitialCaptureSequence();
    persistCaptureSequence();
  }
  renderCollectionBar();
  updateProgressUI();
  bindUIEvents();
  updateLedIndicators('idle');
  startClock();
  scheduleMapInit();
}

function scheduleMapInit() {
  const startMap = () => {
    state.map = initMap();
    renderMarkers();
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(startMap, { timeout: 1200 });
    return;
  }

  window.setTimeout(startMap, 0);
}

function initMap() {
  const map = L.map(elements.mapContainer, {
    zoomControl: true,
    attributionControl: true,
    zoomSnap: 0.5,
  }).setView(MAP_CENTER, MAP_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
    className: 'overworld-map-tile',
  }).addTo(map);

  return map;
}

function renderMarkers() {
  if (!state.map) return;
  const markerBounds = [];
  pokemonSpots.forEach((spot) => {
    const marker = L.marker([spot.lat, spot.lng], {
      icon: createPokemonMarkerIcon(spot),
      keyboard: true,
      alt: `${getPokemonPublicName(spot)} encounter marker`,
    });
    marker.on('click', () => openCaptureOverlay(spot, { source: 'map' }));
    marker.addTo(state.map);
    state.markers.push({ spotId: spot.id, marker });
    markerBounds.push([spot.lat, spot.lng]);
  });

  if (markerBounds.length > 1) {
    state.map.fitBounds(markerBounds, {
      padding: [60, 60],
      maxZoom: 7,
    });
  }
}

function refreshMarkerIcon(spot) {
  const record = state.markers.find((entry) => entry.spotId === spot.id);
  if (record) {
    record.marker.setIcon(createPokemonMarkerIcon(spot));
  }
}

function refreshAllMarkerIcons() {
  pokemonSpots.forEach((spot) => refreshMarkerIcon(spot));
}

function createPokemonMarkerIcon(spot) {
  const isStart = pokemonSpots[0]?.id === spot.id;
  const caught = isPokemonCaught(spot.id);
  const flightTarget = requiresFlightUnlock(spot);
  const flightLocked = flightTarget && !isFlightUnlocked();
  const imgSrc = assetUrl(caught ? spot.collectionSprite || spot.image : getSpotSilhouetteSrc(spot));
  const safeName = escapeHtml(getPokemonPublicName(spot));
  const fallbackSrc = escapeHtml(assetUrl(spot.pixelFallback || spot.fallbackImage || spot.image));
  const imgClass = ['map-pokemon-marker__img'];
  const markerClass = ['map-pokemon-marker'];
  if (isStart) markerClass.push('is-start');
  if (flightLocked) markerClass.push('is-flight-locked');
  if (flightTarget && !flightLocked) markerClass.push('is-flight-ready');
  if (!caught) imgClass.push('is-silhouette');

  const travelBadge = flightTarget
    ? `<span class="map-pokemon-marker__badge map-pokemon-marker__badge--travel">${
        flightLocked ? 'LOCKED' : 'FLY'
      }</span>`
    : '';

  return L.divIcon({
    className: 'map-pokemon-marker-wrapper',
    html: `
      <div class="${markerClass.join(' ')}" title="${safeName}">
        <img src="${imgSrc}" alt="${safeName}" class="${imgClass.join(' ')}" onerror="this.onerror=null;this.src='${fallbackSrc}'" />
        ${isStart ? '<span class="map-pokemon-marker__badge">START</span>' : ''}
        ${travelBadge}
      </div>
    `,
    iconSize: [62, 62],
    iconAnchor: [31, 31],
  });
}

function bindUIEvents() {
  elements.captureCloseBtn.addEventListener('click', closeCaptureOverlay);
  elements.retryButton.addEventListener('click', () => {
    if (!state.selectedSpot) return;
    resetCaptureFlow();
    if (isPokemonCaught(state.selectedSpot.id)) {
      beginThrowPhase(state.selectedSpot);
      return;
    }
    beginIntroPhase(state.selectedSpot);
  });

  elements.travelPromptConfirm.addEventListener('click', () => resolveTravelPrompt(true));
  elements.travelPromptCancel.addEventListener('click', () => resolveTravelPrompt(false));
  elements.travelPrompt.addEventListener('click', (event) => {
    if (event.target === elements.travelPrompt) {
      resolveTravelPrompt(false);
    }
  });

  elements.captureOverlay.addEventListener('click', (event) => {
    if (event.target === elements.captureOverlay) {
      closeCaptureOverlay();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isTravelPromptOpen()) {
      resolveTravelPrompt(false);
      return;
    }
    if (event.key === 'Escape' && isOverlayOpen()) {
      closeCaptureOverlay();
    }
  });

  elements.collectionList.addEventListener('click', (event) => {
    const slot = event.target.closest('.collection-slot');
    if (!slot) return;
    const spotId = Number(slot.dataset.id);
    const spot = pokemonSpots.find((entry) => entry.id === spotId);
    if (spot) openCaptureOverlay(spot, { source: 'collection' });
  });

  elements.resetButton.addEventListener('click', handleResetProgress);
}

async function openCaptureOverlay(spot, options = {}) {
  const { source = 'collection' } = options;
  if (source === 'collection') {
    openCollectionDetails(spot);
    return;
  }

  if (source === 'map') {
    const travelReady = await prepareMapTravel(spot);
    if (!travelReady) return;
    updateLastTravelSpot(spot.id);
  } else if (!isPokemonCaught(spot.id)) {
    await animateRouteToSpot(spot);
  }

  state.selectedSpot = spot;
  highlightCollectionSlot(spot.id);

  const alreadyCaught = isPokemonCaught(spot.id);
  const replayMode = alreadyCaught && isReplayAllowed(spot);
  state.capture.replayMode = replayMode;

  prepareSidebar(spot, { revealed: alreadyCaught, replayMode });
  resetCaptureFlow();

  elements.captureOverlay.classList.remove('hidden');
  elements.captureOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  if (!alreadyCaught || replayMode) {
    beginIntroPhase(spot);
  } else {
    handleCaptureSuccess(spot, { skipCatch: true });
  }
}

function openCollectionDetails(spot) {
  const revealed = isPokemonCaught(spot.id);
  const replayMode = revealed && isReplayAllowed(spot);
  state.selectedSpot = spot;
  state.capture.replayMode = replayMode;
  highlightCollectionSlot(spot.id);
  resetCaptureFlow();
  prepareSidebar(spot, { revealed, replayMode });

  elements.captureOverlay.classList.remove('hidden');
  elements.captureOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  setCaptureStage('details');
  setCaptureVisual(
    createMediaDescriptor(revealed ? spot.image : getSpotSilhouetteSrc(spot), { type: 'image' }),
    `${getPokemonPublicName(spot, { revealed })} pixel artwork`
  );
  elements.captureImage.classList.add('is-detail-artwork');
  elements.captureImage.classList.toggle('is-silhouette', !revealed);
  setStatusText(revealed ? `${spot.name} Pokédex record.` : 'Pokédex data encrypted.');
  elements.captureStory.textContent = revealed
    ? `${spot.name} is registered in your Citydex.`
    : 'Catch this Pokemon on the map to unlock its complete record.';

  elements.captureCloseBtn.textContent = 'Close';
  elements.captureCloseBtn.setAttribute('aria-label', 'Close');

  if (replayMode) {
    elements.retryButton.textContent = 'Replay Encounter';
    elements.retryArea.classList.remove('hidden');
  }
}

function closeCaptureOverlay() {
  if (!isOverlayOpen()) return;
  resetCaptureFlow();
  elements.captureOverlay.classList.add('hidden');
  elements.captureOverlay.setAttribute('aria-hidden', 'true');
  elements.captureCloseBtn.textContent = 'Escape';
  elements.captureCloseBtn.setAttribute('aria-label', 'Escape');
  document.body.classList.remove('modal-open');
  highlightCollectionSlot(null);
  state.selectedSpot = null;
  state.capture.replayMode = false;
}

function isOverlayOpen() {
  return !elements.captureOverlay.classList.contains('hidden');
}

function beginIntroPhase(spot) {
  elements.captureCloseBtn.textContent = 'Escape';
  elements.captureCloseBtn.setAttribute('aria-label', 'Escape');
  setCaptureStage('intro');
  setStatusText(`${getPokemonPublicName(spot)} has appeared.`);
  elements.captureStory.textContent =
    `${getPokemonPublicName(spot)} materializes nearby. Stay calm and lock onto your target.`;
  playTransientSound('spawn');
  playVisualThen(getSpawnVisual(spot), `${getPokemonPublicName(spot)} spawn`, () => beginThrowPhase(spot));
}

function beginThrowPhase(spot) {
  setCaptureStage('throw');
  setStatusText('Poke Ball incoming.');
  elements.captureStory.textContent =
    'The ball is already in motion. Prepare for the lock-in sequence.';
  playVisualThen(getThrowVisual(spot), `${getPokemonPublicName(spot)} ball throw`, () => startCatchPhase(spot));
}

function startCatchPhase(spot) {
  if (isPokemonCaught(spot.id) && !state.capture.replayMode) return;
  setCaptureStage('game');
  setCaptureVisual(getCaptureVisual(spot), `${getPokemonPublicName(spot)} waiting loop`);
  setStatusText('Keep the ball sealed.');
  elements.captureStory.textContent =
    'The ball keeps shaking until you finish the full word chain. The timer starts on your first correct key press.';
  elements.gameSection.classList.remove('hidden');
  startBattleLoop();
  startCatchGame(spot);
}

function playVisualThen(media, alt, next) {
  const descriptor = setCaptureVisual(media, alt);
  if (typeof next !== 'function') return;
  if (!descriptor || descriptor.type !== 'video') {
    scheduleSequenceAdvance(next, INTRO_LEAD_MS);
    return;
  }
  attachVideoEndHandler(next, VIDEO_SEQUENCE_FALLBACK_MS);
}

function scheduleSequenceAdvance(callback, delay = INTRO_LEAD_MS) {
  clearSequenceTimeout();
  if (typeof callback !== 'function') return;
  state.capture.sequenceTimeout = window.setTimeout(callback, delay);
}

function clearSequenceTimeout() {
  if (state.capture.sequenceTimeout) {
    clearTimeout(state.capture.sequenceTimeout);
    state.capture.sequenceTimeout = null;
  }
}

function attachVideoEndHandler(callback, fallbackDelay = VIDEO_SEQUENCE_FALLBACK_MS) {
  if (typeof callback !== 'function') return;
  clearVideoEndHandler();
  const video = elements.captureVideo;
  if (!video || video.classList.contains('hidden')) {
    if (typeof fallbackDelay === 'number') {
      state.capture.videoEndFallback = window.setTimeout(callback, fallbackDelay);
    } else {
      callback();
    }
    return;
  }

  const handler = () => {
    clearVideoEndHandler();
    callback();
  };

  state.capture.videoEndHandler = handler;
  video.addEventListener('ended', handler, { once: true });

  if (typeof fallbackDelay === 'number') {
    state.capture.videoEndFallback = window.setTimeout(() => {
      if (state.capture.videoEndHandler === handler) {
        clearVideoEndHandler();
        callback();
      }
    }, fallbackDelay);
  }
}

function clearVideoEndHandler() {
  const video = elements.captureVideo;
  if (state.capture.videoEndHandler && video) {
    video.removeEventListener('ended', state.capture.videoEndHandler);
  }
  if (state.capture.videoEndFallback) {
    clearTimeout(state.capture.videoEndFallback);
    state.capture.videoEndFallback = null;
  }
  state.capture.videoEndHandler = null;
}

function setCaptureStage(stage) {
  state.capture.stage = stage;

  clearSequenceTimeout();
  clearVideoEndHandler();
  updateLedIndicators(stage);

  elements.retryArea.classList.add('hidden');

  if (stage !== 'game') {
    elements.gameSection.classList.add('hidden');
  }
}

function resetCaptureFlow() {
  clearSidebarRevealTimer();
  clearSuccessFx();
  clearSequenceTimeout();
  clearVideoEndHandler();
  stopBattleLoop();
  if (state.sounds.transient) {
    state.sounds.transient.pause();
    state.sounds.transient = null;
  }

  elements.retryArea.classList.add('hidden');
  elements.retryButton.textContent = 'Retry Encounter';

  setStatusText('Preparing the encounter...');
  elements.captureStory.textContent =
    'A sudden burst of static over Warsaw signals an Electric-type nearby.';
  setCaptureVisual('', '', { hide: true });

  resetGameUI();
  teardownCatchGame({ clearSequence: true });
  state.capture.stage = 'idle';
}

function resetGameUI() {
  elements.sequenceDisplay.innerHTML = '';
  elements.timerFill.style.width = '100%';
  elements.gameDifficulty.textContent = 'Difficulty: ???';
  elements.gameWords.textContent = 'Sequence: ???';
  elements.gameSection.classList.add('hidden');
  setFeedback('Type when you are ready.', 'info');
}

function startCatchGame(spot) {
  if (isPokemonCaught(spot.id) && !state.capture.replayMode) return;

  teardownCatchGame({ clearSequence: true });

  const challenge = buildChallenge(spot);
  state.catchGame = {
    spotId: spot.id,
    challenge,
    sequence: challenge.sequence,
    progress: 0,
    startedAt: null,
    started: false,
    rafId: null,
    totalTimeout: null,
    betweenTimeout: null,
    attemptRecorded: false,
  };

  renderSequence(challenge.sequence);
  updateSequenceProgress(0);
  elements.gameDifficulty.textContent = `Difficulty: ${challenge.profile.label}`;
  elements.gameWords.textContent = `Sequence: ${challenge.sequence.join(' ')}`;
  elements.timerFill.style.width = '100%';
  setFeedback('The timer starts on your first correct key.', 'info');

  document.addEventListener('keydown', handleGameKeydown);
}

function buildChallenge(spot) {
  const profile = getDifficultyProfile(spot.difficulty);
  const sequence = [];
  for (let index = 0; index < profile.letterCount; index += 1) {
    sequence.push(LETTER_POOL[randomBetween(0, LETTER_POOL.length - 1)]);
  }

  return {
    profile,
    sequence,
  };
}

function getDifficultyProfile(level) {
  return DIFFICULTY_PROFILES[level] || DIFFICULTY_PROFILES[3];
}

function handleGameKeydown(event) {
  if (!state.catchGame || !state.selectedSpot) return;

  const key = event.key.toUpperCase();
  if (key.length !== 1 || !/[A-Z0-9]/.test(key)) return;

  const expected = state.catchGame.sequence[state.catchGame.progress];
  if (!state.catchGame.attemptRecorded) {
    recordAttempt(state.selectedSpot.id);
    state.catchGame.attemptRecorded = true;
  }
  if (key !== expected) {
    failCatchAttempt('wrong key');
    return;
  }

  if (!state.catchGame.started) {
    armCatchGame();
    playPokeballSound();
    setFeedback('Timer active. Keep the ball closed.', 'success');
  } else {
    playPokeballSound();
    setFeedback('Good. Keep going.', 'success');
  }

  state.catchGame.progress += 1;
  updateSequenceProgress(state.catchGame.progress);
  scheduleBetweenTimeout();

  if (state.catchGame.progress === state.catchGame.sequence.length) {
    succeedCatchAttempt(state.selectedSpot);
  }
}

function armCatchGame() {
  if (!state.catchGame || state.catchGame.started) return;

  state.catchGame.started = true;
  state.catchGame.startedAt = performance.now();
  state.catchGame.totalTimeout = window.setTimeout(() => {
    failCatchAttempt('overall timer expired');
  }, state.catchGame.challenge.profile.totalDuration);
  runTimerBar();
}

function runTimerBar() {
  if (!state.catchGame || !state.catchGame.startedAt) return;

  const { totalDuration } = state.catchGame.challenge.profile;
  const tick = (timestamp) => {
    if (!state.catchGame || !state.catchGame.startedAt) return;

    const elapsed = timestamp - state.catchGame.startedAt;
    const ratio = Math.min(elapsed / totalDuration, 1);
    elements.timerFill.style.width = `${(1 - ratio) * 100}%`;

    if (ratio < 1) {
      state.catchGame.rafId = requestAnimationFrame(tick);
    }
  };

  state.catchGame.rafId = requestAnimationFrame(tick);
}

function scheduleBetweenTimeout() {
  if (!state.catchGame || !state.catchGame.started) return;

  if (state.catchGame.betweenTimeout) {
    clearTimeout(state.catchGame.betweenTimeout);
  }

  const { betweenMin, betweenMax } = state.catchGame.challenge.profile;
  const windowMs = randomBetween(betweenMin, betweenMax);
  state.catchGame.betweenTimeout = window.setTimeout(() => {
    failCatchAttempt('you paused too long');
  }, windowMs);
}

function failCatchAttempt(reason) {
  setFeedback(`Missed: ${reason}.`, 'error');
  teardownCatchGame();
  handleCaptureFail(reason);
}

function succeedCatchAttempt(spot) {
  if (!isPokemonCaught(spot.id)) {
    appendCaptureSequence(spot.id);
    saveCaptureRecord(spot.id, {
      attempts: getAttemptCount(spot.id),
      capturedAt: formatClockTime(new Date()),
      order: state.captureSequence.length - 1,
    });
  }
  if (!isPokemonCaught(spot.id)) {
    catchPokemon(spot.id);
  }

  setFeedback('Catch confirmed.', 'success');
  teardownCatchGame();
  handleCaptureSuccess(spot);
  updateProgressUI();
  updateCollectionUI();
  refreshAllMarkerIcons();
}

function handleCaptureSuccess(spot, options = {}) {
  const { skipCatch = false } = options;
  stopBattleLoop();
  if (!skipCatch) playTransientSound('catch');
  setCaptureStage('success');
  if (isReplayAllowed(spot)) {
    state.capture.replayMode = true;
  }

  const successVisual = !skipCatch ? getSuccessVisual(spot) : createMediaDescriptor([spot.image, spot.pixelFallback, spot.fallbackImage]);
  if (successVisual) {
    setCaptureVisual(successVisual, `${spot.name} success`);
  } else {
    setCaptureVisual('', '', { hide: true });
  }
  clearSidebarRevealTimer();
  prepareSidebar(spot, { revealed: true, replayMode: state.capture.replayMode });

  const revealSidebarInfo = () => {
    setSidebarReveal(true);
    elements.sidebarStatus.textContent = 'Caught';
    elements.sidebarHint.textContent = getSidebarHint(spot, {
      revealed: true,
      replayMode: state.capture.replayMode,
    });
    state.capture.infoRevealTimeout = null;
  };

  if (skipCatch) {
    setStatusText(`${spot.name} is already registered.`, 'success');
    elements.captureStory.textContent =
      `${spot.name} is safely stored in your Citydex. You can replay the encounter anytime.`;
    revealSidebarInfo();
  } else {
    setStatusText('Result: Caught!', 'success');
    elements.captureStory.textContent =
      'The ball clicks shut, the signal stabilizes, and the Pokedex starts decoding the full record.';
    triggerSuccessFx(spot.name);
    setSidebarReveal(false);
    elements.sidebarStatus.textContent = 'Decoding';
    elements.sidebarHint.textContent = 'Decoding full Pokedex record...';
    state.capture.infoRevealTimeout = window.setTimeout(revealSidebarInfo, RESULT_REVEAL_DELAY_MS);
  }

  if (isReplayAllowed(spot)) {
    elements.retryButton.textContent = 'Replay Encounter';
    elements.retryArea.classList.remove('hidden');
  }
}

function handleCaptureFail(reason) {
  const spot = state.selectedSpot;
  stopBattleLoop();
  setCaptureStage('fail');
  setCaptureVisual(getFailVisual(spot), `${getPokemonPublicName(spot)} escaped`);
  setStatusText(`Result: Escaped.`, 'error');
  elements.captureStory.textContent =
    `The seal broke because ${reason}. Reset your timing and launch another attempt.`;

  clearSidebarRevealTimer();
  setSidebarReveal(false);
  if (spot) {
    prepareSidebar(spot, { revealed: false, replayMode: false });
  }

  elements.retryButton.textContent = 'Retry Encounter';
  elements.retryArea.classList.remove('hidden');
}

function teardownCatchGame(options = {}) {
  if (state.catchGame?.rafId) cancelAnimationFrame(state.catchGame.rafId);
  if (state.catchGame?.totalTimeout) clearTimeout(state.catchGame.totalTimeout);
  if (state.catchGame?.betweenTimeout) clearTimeout(state.catchGame.betweenTimeout);

  document.removeEventListener('keydown', handleGameKeydown);

  if (options.clearSequence) {
    elements.sequenceDisplay.innerHTML = '';
    elements.timerFill.style.width = '100%';
  }

  state.catchGame = null;
}

function renderSequence(sequence) {
  elements.sequenceDisplay.innerHTML = '';
  sequence.forEach((char, index) => {
    const span = document.createElement('span');
    span.className = 'sequence-char';
    span.dataset.index = String(index);
    span.textContent = char;
    elements.sequenceDisplay.appendChild(span);
  });
}

function updateSequenceProgress(progress) {
  elements.sequenceDisplay.querySelectorAll('.sequence-char').forEach((charEl, index) => {
    charEl.classList.toggle('completed', index < progress);
    charEl.classList.toggle('active', index === progress);
  });
}

function renderCollectionBar() {
  elements.collectionList.innerHTML = '';
  pokemonSpots.forEach((spot) => {
    const caught = isPokemonCaught(spot.id);
    const flightLocked = requiresFlightUnlock(spot) && !isFlightUnlocked();
    const flightReady = requiresFlightUnlock(spot) && isFlightUnlocked();
    const slot = document.createElement('button');
    slot.className = 'collection-slot';
    slot.dataset.id = String(spot.id);
    slot.type = 'button';
    slot.classList.toggle('caught', caught);
    slot.classList.toggle('locked', !caught);
    slot.classList.toggle('travel-locked', flightLocked);
    slot.classList.toggle('travel-ready', flightReady && !caught);

    const img = document.createElement('img');
    img.alt = caught ? spot.name : 'Unknown Pokémon';
    img.src = assetUrl(caught ? spot.collectionSprite || spot.image : getSpotSilhouetteSrc(spot));
    img.loading = 'lazy';
    img.decoding = 'async';
    img.classList.toggle('is-silhouette', !caught);
    attachImageFallback(
      img,
      caught
        ? [spot.image, spot.pixelFallback, spot.fallbackImage]
        : [spot.pixelFallback, spot.fallbackImage, getSpotSilhouetteSrc(spot), spot.image]
    );

    const label = document.createElement('span');
    label.className = 'slot-label';
    label.textContent = caught ? spot.name : '???';

    const status = document.createElement('span');
    status.className = 'slot-status';
    if (caught) {
      status.textContent = `Caught · ${formatAttemptCount(getAttemptCount(spot.id))}`;
    } else if (flightLocked) {
      status.textContent = 'Locked · Requires Pidgeot';
    } else if (flightReady) {
      status.textContent = `Flight unlocked · ${formatAttemptCount(getAttemptCount(spot.id))}`;
    } else {
      status.textContent = formatAttemptCount(getAttemptCount(spot.id));
    }

    slot.appendChild(img);
    slot.appendChild(label);
    slot.appendChild(status);
    slot.classList.toggle('selected', state.selectedSpot?.id === spot.id);
    elements.collectionList.appendChild(slot);
  });

  const caughtCount = state.caughtSet.size;
  elements.collectionHint.textContent =
    caughtCount === 0 ? 'No Pokemon registered yet.' : `${caughtCount} / ${pokemonSpots.length} entries unlocked.`;
}

function updateCollectionUI() {
  renderCollectionBar();
}

function highlightCollectionSlot(id) {
  elements.collectionList.querySelectorAll('.collection-slot').forEach((slot) => {
    slot.classList.toggle('selected', Number(slot.dataset.id) === id);
  });
}

function handleResetProgress() {
  state.caughtSet.clear();
  state.captureRecords = {};
  state.attemptCounts = {};
  state.captureSequence = [];
  state.lastTravelSpotId = null;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(CAPTURE_RECORDS_KEY);
  window.localStorage.removeItem(ATTEMPT_COUNTS_KEY);
  window.localStorage.removeItem(LEGACY_PENDING_ATTEMPTS_KEY);
  window.localStorage.removeItem(CAPTURE_SEQUENCE_KEY);
  window.localStorage.removeItem(LAST_TRAVEL_SPOT_KEY);
  renderCollectionBar();
  updateProgressUI();
  highlightCollectionSlot(null);
  elements.sidebarHint.textContent = 'Catch the Pokemon to unlock the full Pokédex entry.';
  prepareSidebar(pokemonSpots[0], { revealed: false, replayMode: false });
  if (isOverlayOpen()) {
    resetCaptureFlow();
    state.selectedSpot = null;
  }
  refreshAllMarkerIcons();
}

function updateProgressUI() {
  elements.progressCounter.textContent =
    `Caught: ${state.caughtSet.size} / ${pokemonSpots.length} · Attempts: ${getTotalAttemptCount()}`;
}

function prepareSidebar(spot, options = {}) {
  const caught = isPokemonCaught(spot.id);
  const { revealed = caught, replayMode = false } = options;
  const record = state.captureRecords[spot.id] || null;
  elements.sidebarNumber.textContent = revealed ? spot.dexNumber || '???' : '???';
  elements.sidebarName.textContent = revealed ? spot.name || 'Unknown' : '???';
  elements.sidebarSpecies.textContent = revealed ? spot.species || 'Unknown species' : '';
  elements.sidebarType.textContent = revealed ? joinList(spot.type) : '';
  elements.sidebarCategory.textContent = revealed ? spot.category || '???' : '';
  elements.sidebarHeight.textContent = revealed ? spot.height || '???' : '';
  elements.sidebarWeight.textContent = revealed ? spot.weight || '???' : '';
  elements.sidebarAbility.textContent = revealed ? spot.ability || '???' : '';
  elements.sidebarHabitat.textContent = revealed ? spot.habitat || '???' : '';
  elements.sidebarWeakness.textContent = revealed ? joinList(spot.weakness) : '';
  elements.sidebarDifficulty.textContent = revealed ? getDifficultyProfile(spot.difficulty).label : '';
  elements.sidebarLocation.textContent = revealed ? spot.locationName || `${spot.lat.toFixed(4)}, ${spot.lng.toFixed(4)}` : '';
  elements.sidebarStatus.textContent = revealed ? 'Caught' : getTravelLockStatusLabel(spot);
  elements.sidebarTime.textContent = revealed ? record?.capturedAt || formatClockTime(new Date()) : '';
  elements.sidebarAttempts.textContent = revealed ? String(getAttemptCount(spot.id)) : '';
  elements.sidebarEntry.textContent = revealed ? spot.dexEntry || spot.description || 'No entry available.' : '';
  elements.sidebarHint.textContent = getSidebarHint(spot, { revealed, replayMode });
  setSidebarReveal(revealed);
}

function getSidebarHint(spot, { revealed, replayMode }) {
  const flightLocked = requiresFlightUnlock(spot) && !isFlightUnlocked();
  if (!revealed) {
    if (flightLocked) {
      return 'Catch Pidgeot first to unlock air travel to this encounter.';
    }
    if (requiresFlightUnlock(spot)) {
      return 'Air route unlocked. Fly in and complete the sequence to lock the Poke Ball.';
    }
    return 'Complete the sequence to lock the Poke Ball.';
  }
  if (isReplayAllowed(spot)) {
    if (replayMode) return 'Replay mode active. You can run the Pikachu encounter again.';
    if (revealed) return 'Full record unlocked. Replay remains available for testing.';
  }
  return revealed
    ? 'Full Pokedex record unlocked.'
    : 'Catch the Pokemon to unlock the full Pokedex entry.';
}

function setCaptureVisual(media, alt = '', options = {}) {
  const { hide = false } = options;
  clearVideoEndHandler();
  if (hide) {
    hideCaptureMedia();
    return null;
  }

  const descriptor = normalizeMediaDescriptor(media, options);
  if (!descriptor) {
    hideCaptureMedia();
    return null;
  }

  if (descriptor.type === 'video') {
    showCaptureVideo(descriptor, alt);
  } else {
    showCaptureImage(descriptor, alt);
  }

  return descriptor;
}

function setFeedback(message, level) {
  elements.gameFeedback.textContent = message;
  elements.gameFeedback.className = `game-feedback ${level}`;
}

function setStatusText(text, variant = 'info') {
  elements.captureStatusText.textContent = text;
  elements.captureStatusText.classList.remove('is-success', 'is-error');
  if (variant === 'success') elements.captureStatusText.classList.add('is-success');
  if (variant === 'error') elements.captureStatusText.classList.add('is-error');
}

function setSidebarReveal(revealed) {
  elements.sidebarInfo.classList.toggle('hidden', !revealed);
  elements.sidebarInfo.classList.toggle('revealed', revealed);
}

function clearSidebarRevealTimer() {
  if (state.capture.infoRevealTimeout) {
    clearTimeout(state.capture.infoRevealTimeout);
    state.capture.infoRevealTimeout = null;
  }
}

function updateLedIndicators(stage) {
  if (!elements.ledReady || !elements.ledCapture) return;
  const captureActive = stage === 'game';
  elements.ledReady.classList.toggle('is-active', !captureActive);
  elements.ledCapture.classList.toggle('is-active', captureActive);
}

function playTransientSound(name) {
  const clip = AUDIO_CLIPS[name];
  if (!clip) return;
  if (state.sounds.transient) {
    state.sounds.transient.pause();
    state.sounds.transient = null;
  }
  const audio = new Audio(assetUrl(clip));
  audio.volume = 0.85;
  audio.play().catch(() => {});
  audio.addEventListener('ended', () => {
    if (state.sounds.transient === audio) {
      state.sounds.transient = null;
    }
  });
  state.sounds.transient = audio;
}

function startBattleLoop() {
  if (state.sounds.battle) return;
  const clip = AUDIO_CLIPS.battle;
  if (!clip) return;
  const audio = new Audio(assetUrl(clip));
  audio.loop = true;
  audio.volume = 0.5;
  const playPromise = audio.play();
  if (playPromise?.catch) playPromise.catch(() => {});
  state.sounds.battle = audio;
}

function stopBattleLoop() {
  if (state.sounds.battle) {
    state.sounds.battle.pause();
    state.sounds.battle = null;
  }
}

function triggerSuccessFx(pokemonName) {
  clearSuccessFx();
  elements.captureStampMessage.textContent = `${pokemonName} was caught!`;
  elements.captureStars.classList.remove('hidden');
  elements.captureStamp.classList.remove('hidden');
  state.capture.successFxTimeout = window.setTimeout(() => {
    elements.captureStars.classList.add('hidden');
    state.capture.successFxTimeout = null;
  }, 1200);
}

function clearSuccessFx() {
  if (state.capture.successFxTimeout) {
    clearTimeout(state.capture.successFxTimeout);
    state.capture.successFxTimeout = null;
  }
  elements.captureStars.classList.add('hidden');
  elements.captureStamp.classList.add('hidden');
  elements.captureStampMessage.textContent = '';
}

function startClock() {
  if (!elements.currentTime) return;
  const update = () => {
    elements.currentTime.textContent = formatClockTime(new Date());
  };
  update();
  window.setInterval(update, 1000);
}

function loadCaughtSet() {
  if (typeof window === 'undefined') return new Set();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id) => Number.isInteger(id)));
  } catch (error) {
    window.localStorage.removeItem(STORAGE_KEY);
    return new Set();
  }
}

function loadCaptureRecords() {
  try {
    const raw = window.localStorage.getItem(CAPTURE_RECORDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    window.localStorage.removeItem(CAPTURE_RECORDS_KEY);
    return {};
  }
}

function persistCaptureRecords() {
  window.localStorage.setItem(CAPTURE_RECORDS_KEY, JSON.stringify(state.captureRecords));
}

function saveCaptureRecord(id, record) {
  state.captureRecords[id] = record;
  persistCaptureRecords();
}

function loadAttemptCounts() {
  try {
    const raw = window.localStorage.getItem(ATTEMPT_COUNTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_PENDING_ATTEMPTS_KEY);
    const legacyAttempts = legacyRaw ? JSON.parse(legacyRaw) : {};
    const migratedCounts = {};
    pokemonSpots.forEach((spot) => {
      const recordedAttempts = Number(state.captureRecords[spot.id]?.attempts || 0);
      const pendingAttempts = Number(legacyAttempts?.[spot.id] || 0);
      const attempts = Math.max(recordedAttempts, pendingAttempts);
      if (attempts > 0) migratedCounts[spot.id] = attempts;
    });
    return migratedCounts;
  } catch {
    window.localStorage.removeItem(ATTEMPT_COUNTS_KEY);
    return {};
  }
}

function persistAttemptCounts() {
  window.localStorage.setItem(ATTEMPT_COUNTS_KEY, JSON.stringify(state.attemptCounts));
}

function loadLastTravelSpotId() {
  try {
    const raw = window.localStorage.getItem(LAST_TRAVEL_SPOT_KEY);
    if (!raw) return pokemonSpots[0]?.id ?? null;
    const parsed = Number(JSON.parse(raw));
    return Number.isInteger(parsed) ? parsed : pokemonSpots[0]?.id ?? null;
  } catch {
    window.localStorage.removeItem(LAST_TRAVEL_SPOT_KEY);
    return pokemonSpots[0]?.id ?? null;
  }
}

function persistLastTravelSpotId() {
  window.localStorage.setItem(LAST_TRAVEL_SPOT_KEY, JSON.stringify(state.lastTravelSpotId));
}

function updateLastTravelSpot(id) {
  if (!Number.isInteger(id)) return;
  state.lastTravelSpotId = id;
  persistLastTravelSpotId();
}

function loadCaptureSequence() {
  try {
    const raw = window.localStorage.getItem(CAPTURE_SEQUENCE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => Number.isInteger(id)) : [];
  } catch {
    window.localStorage.removeItem(CAPTURE_SEQUENCE_KEY);
    return [];
  }
}

function persistCaptureSequence() {
  window.localStorage.setItem(CAPTURE_SEQUENCE_KEY, JSON.stringify(state.captureSequence));
}

function buildInitialCaptureSequence() {
  const recordsWithOrder = Object.entries(state.captureRecords)
    .map(([id, record]) => ({
      id: Number(id),
      order: Number(record?.order),
    }))
    .filter((entry) => Number.isInteger(entry.id) && Number.isFinite(entry.order))
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.id);

  if (recordsWithOrder.length) {
    return recordsWithOrder;
  }

  return pokemonSpots.filter((spot) => state.caughtSet.has(spot.id)).map((spot) => spot.id);
}

function appendCaptureSequence(id) {
  if (state.captureSequence[state.captureSequence.length - 1] === id) return;
  state.captureSequence = state.captureSequence.filter((entry) => entry !== id);
  state.captureSequence.push(id);
  persistCaptureSequence();
}

function recordAttempt(id) {
  state.attemptCounts[id] = getAttemptCount(id) + 1;
  persistAttemptCounts();
  updateProgressUI();
  updateCollectionUI();
}

function getAttemptCount(id) {
  return Number(state.attemptCounts[id] || 0);
}

function getTotalAttemptCount() {
  return Object.values(state.attemptCounts).reduce((total, attempts) => total + Number(attempts || 0), 0);
}

function formatAttemptCount(attempts) {
  return `${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}`;
}

function persistCaughtSet() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.caughtSet]));
}

function catchPokemon(id) {
  if (state.caughtSet.has(id)) return;
  state.caughtSet.add(id);
  persistCaughtSet();
}

async function prepareMapTravel(spot) {
  const originSpot = getRouteOriginSpot(spot);
  if (!originSpot) return true;

  if (!canTravelToSpot(spot)) {
    await showTravelPrompt({
      title: 'Air Route Locked',
      message: `Catch Pidgeot first to unlock flights to ${getPokemonPublicName(spot)}.`,
      confirmLabel: 'OK',
      cancelLabel: '',
      showCancel: false,
      originSpot,
      targetSpot: spot,
      locked: true,
    });
    return false;
  }

  if (shouldUseFlightForRoute(originSpot, spot)) {
    const confirmed = await showTravelPrompt({
      title: `Fly to ${getPokemonPublicName(spot)}?`,
      message: `Pidgeot can fly you from ${getPokemonPublicName(originSpot)} to ${getPokemonPublicName(spot)}. Do you want to take the air route now?`,
      confirmLabel: 'Fly Now',
      cancelLabel: 'Stay Here',
      showCancel: true,
      originSpot,
      targetSpot: spot,
    });
    if (!confirmed) return false;
  }

  await animateRouteToSpot(spot);
  return true;
}

async function animateRouteToSpot(spot) {
  if (!state.map) return;
  const originSpot = getRouteOriginSpot(spot);
  if (!originSpot || originSpot.id === spot.id) return;

  if (shouldUseFlightForRoute(originSpot, spot)) {
    await animateFlightToSpot(originSpot, spot);
    return;
  }

  const routePoints = await fetchRoutePath(originSpot, spot);
  if (routePoints.length < 2) return;

  clearRouteAnimation();

  state.route.baseLine = L.polyline(routePoints, {
    color: '#37687b',
    weight: 8,
    opacity: 0.55,
    lineCap: 'round',
    dashArray: '2 14',
  }).addTo(state.map);

  state.route.progressLine = L.polyline([routePoints[0]], {
    color: '#f29135',
    weight: 6,
    opacity: 0.95,
    lineCap: 'round',
    dashArray: '1 12',
  }).addTo(state.map);

  state.route.walker = L.circleMarker(routePoints[0], {
    radius: 9,
    color: '#fff8cf',
    weight: 3,
    fillColor: '#f29135',
    fillOpacity: 1,
  }).addTo(state.map);

  state.map.fitBounds(routePoints, {
    padding: [100, 100],
    maxZoom: 16,
  });

  await animateForDuration(ROUTE_ANIMATION_MS, (progress) => {
    const currentPoint = getPointAlongRoute(routePoints, progress);
    const traversedPoints = getTraversedRoutePoints(routePoints, progress);
    state.route.progressLine.setLatLngs(traversedPoints);
    state.route.walker.setLatLng(currentPoint);
  });
  focusMapOnSpot(spot, 16);
}

function getRouteOriginSpot(targetSpot) {
  const lastTravelSpot = pokemonSpots.find((spot) => spot.id === state.lastTravelSpotId) || null;
  if (!lastTravelSpot) {
    return pokemonSpots[0] ?? null;
  }
  if (lastTravelSpot.id === targetSpot.id) {
    return lastTravelSpot;
  }

  return lastTravelSpot;
}

async function animateFlightToSpot(originSpot, targetSpot) {
  if (!state.map) return;
  const routePoints = buildFlightPath(originSpot, targetSpot);
  if (routePoints.length < 2) return;

  clearRouteAnimation();

  state.route.baseLine = L.polyline(routePoints, {
    color: '#8ad8ff',
    weight: 5,
    opacity: 0.38,
    lineCap: 'round',
    dashArray: '10 16',
  }).addTo(state.map);

  state.route.progressLine = L.polyline([routePoints[0]], {
    color: '#fff0a6',
    weight: 7,
    opacity: 0.9,
    lineCap: 'round',
  }).addTo(state.map);

  state.route.walker = L.marker(routePoints[0], {
    icon: createFlightMarkerIcon(),
    keyboard: false,
    zIndexOffset: 1000,
  }).addTo(state.map);

  state.map.fitBounds(routePoints, {
    padding: [120, 120],
    maxZoom: 7,
  });

  await animateForDuration(FLIGHT_ANIMATION_MS, (progress) => {
    const easedProgress = easeInOutCubic(progress);
    const currentPoint = getPointAlongRoute(routePoints, easedProgress);
    const traversedPoints = getTraversedRoutePoints(routePoints, easedProgress);
    state.route.progressLine.setLatLngs(traversedPoints);
    state.route.walker.setLatLng(currentPoint);
  });
  focusMapOnSpot(targetSpot, 16);
}

async function fetchRoutePath(originSpot, targetSpot) {
  const fallback = [
    [originSpot.lat, originSpot.lng],
    [targetSpot.lat, targetSpot.lng],
  ];

  try {
    const response = await fetch(
      `${ROUTE_API_URL}/${originSpot.lng},${originSpot.lat};${targetSpot.lng},${targetSpot.lat}?overview=full&geometries=geojson`,
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) return fallback;

    const data = await response.json();
    const coordinates = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return fallback;

    return coordinates.map(([lng, lat]) => [lat, lng]);
  } catch {
    return fallback;
  }
}

function clearRouteAnimation() {
  if (state.route.animationFrame) {
    cancelAnimationFrame(state.route.animationFrame);
    state.route.animationFrame = null;
  }
  for (const key of ['baseLine', 'progressLine', 'walker']) {
    if (state.route[key] && state.map) {
      state.map.removeLayer(state.route[key]);
    }
    state.route[key] = null;
  }
}

function animateForDuration(duration, onFrame) {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      onFrame(progress);
      if (progress < 1) {
        state.route.animationFrame = requestAnimationFrame(tick);
      } else {
        state.route.animationFrame = null;
        resolve();
      }
    };
    state.route.animationFrame = requestAnimationFrame(tick);
  });
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - ((-2 * value + 2) ** 3) / 2;
}

function interpolate(start, end, progress) {
  return start + (end - start) * progress;
}

function buildFlightPath(originSpot, targetSpot, segments = 48) {
  const start = [originSpot.lat, originSpot.lng];
  const end = [targetSpot.lat, targetSpot.lng];
  const distance = Math.max(distanceBetween(start, end), 0.001);
  const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const perp = [-(end[1] - start[1]) / distance, (end[0] - start[0]) / distance];
  const arcStrength = Math.min(Math.max(distance * 0.18, 0.25), 2.4);

  const controlA = [mid[0] + perp[0] * arcStrength, mid[1] + perp[1] * arcStrength];
  const controlB = [mid[0] - perp[0] * arcStrength, mid[1] - perp[1] * arcStrength];
  const control = controlA[0] >= controlB[0] ? controlA : controlB;

  const points = [];
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    points.push(getQuadraticBezierPoint(start, control, end, t));
  }
  return points;
}

function getQuadraticBezierPoint(start, control, end, t) {
  const inverse = 1 - t;
  const lat =
    inverse * inverse * start[0] +
    2 * inverse * t * control[0] +
    t * t * end[0];
  const lng =
    inverse * inverse * start[1] +
    2 * inverse * t * control[1] +
    t * t * end[1];
  return [lat, lng];
}

function getPointAlongRoute(routePoints, progress) {
  if (routePoints.length < 2) return routePoints[0];
  const segmentLengths = [];
  let totalLength = 0;

  for (let index = 1; index < routePoints.length; index += 1) {
    const length = distanceBetween(routePoints[index - 1], routePoints[index]);
    segmentLengths.push(length);
    totalLength += length;
  }

  if (totalLength === 0) return routePoints[routePoints.length - 1];

  let remaining = totalLength * progress;
  for (let index = 1; index < routePoints.length; index += 1) {
    const segmentLength = segmentLengths[index - 1];
    if (remaining <= segmentLength) {
      const [startLat, startLng] = routePoints[index - 1];
      const [endLat, endLng] = routePoints[index];
      const ratio = segmentLength === 0 ? 0 : remaining / segmentLength;
      return [
        interpolate(startLat, endLat, ratio),
        interpolate(startLng, endLng, ratio),
      ];
    }
    remaining -= segmentLength;
  }

  return routePoints[routePoints.length - 1];
}

function getTraversedRoutePoints(routePoints, progress) {
  if (routePoints.length < 2) return routePoints;
  const currentPoint = getPointAlongRoute(routePoints, progress);
  const segmentLengths = [];
  let totalLength = 0;

  for (let index = 1; index < routePoints.length; index += 1) {
    const length = distanceBetween(routePoints[index - 1], routePoints[index]);
    segmentLengths.push(length);
    totalLength += length;
  }

  let remaining = totalLength * progress;
  const traversed = [routePoints[0]];

  for (let index = 1; index < routePoints.length; index += 1) {
    const segmentLength = segmentLengths[index - 1];
    if (remaining >= segmentLength) {
      traversed.push(routePoints[index]);
      remaining -= segmentLength;
      continue;
    }
    traversed.push(currentPoint);
    break;
  }

  if (traversed.length === 1) {
    traversed.push(currentPoint);
  }

  return traversed;
}

function distanceBetween([lat1, lng1], [lat2, lng2]) {
  const latDiff = lat2 - lat1;
  const lngDiff = lng2 - lng1;
  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
}

function focusMapOnSpot(spot, zoom = 16) {
  if (!state.map || !spot) return;
  state.map.flyTo([spot.lat, spot.lng], zoom, {
    animate: true,
    duration: 0.9,
  });
}

function requiresFlightUnlock(spot) {
  const hubSpot = pokemonSpots[0];
  if (!spot || !hubSpot || spot.id === hubSpot.id) return false;
  return getTravelDistanceKm(hubSpot, spot) > REMOTE_TRAVEL_DISTANCE_KM;
}

function isFlightUnlocked() {
  return isPokemonCaught(PIDGEOT_ID);
}

function canTravelToSpot(spot) {
  return !requiresFlightUnlock(spot) || isFlightUnlocked();
}

function shouldUseFlightForRoute(originSpot, targetSpot) {
  if (!originSpot || !targetSpot || !isFlightUnlocked()) return false;
  return getTravelDistanceKm(originSpot, targetSpot) > REMOTE_TRAVEL_DISTANCE_KM;
}

function getTravelDistanceKm(originSpot, targetSpot) {
  if (!originSpot || !targetSpot) return 0;
  return haversineDistanceKm(originSpot.lat, originSpot.lng, targetSpot.lat, targetSpot.lng);
}

function getTravelLockStatusLabel(spot) {
  if (requiresFlightUnlock(spot) && !isFlightUnlocked()) {
    return 'Travel Locked';
  }
  if (requiresFlightUnlock(spot) && isFlightUnlocked()) {
    return 'Flight Ready';
  }
  return '';
}

function isPokemonCaught(id) {
  return state.caughtSet.has(id);
}

function getPokemonPublicName(spot, options = {}) {
  const revealed = options.revealed ?? isPokemonCaught(spot?.id);
  return revealed ? spot?.name || 'Unknown Pokémon' : 'Unknown Pokémon';
}

function isTravelPromptOpen() {
  return !elements.travelPrompt.classList.contains('hidden');
}

function showTravelPrompt(config) {
  const {
    title,
    message,
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    showCancel = true,
    originSpot = null,
    targetSpot = null,
    locked = false,
  } = config;

  if (state.prompt.resolver) {
    resolveTravelPrompt(false);
  }

  elements.travelPromptTitle.textContent = title;
  elements.travelPromptText.textContent = message;
  elements.travelPromptRoute.textContent =
    originSpot && targetSpot
      ? `${getPokemonPublicName(originSpot)} → ${getPokemonPublicName(targetSpot)} · ${Math.round(getTravelDistanceKm(originSpot, targetSpot))} km`
      : locked
        ? 'Pidgeot required'
        : 'Air route available';
  elements.travelPromptConfirm.textContent = confirmLabel;
  elements.travelPromptCancel.textContent = cancelLabel;
  elements.travelPromptCancel.classList.toggle('hidden', !showCancel);
  elements.travelPrompt.classList.remove('hidden');
  elements.travelPrompt.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  return new Promise((resolve) => {
    state.prompt.resolver = resolve;
  });
}

function resolveTravelPrompt(value) {
  if (!state.prompt.resolver) return;
  const resolver = state.prompt.resolver;
  state.prompt.resolver = null;
  elements.travelPrompt.classList.add('hidden');
  elements.travelPrompt.setAttribute('aria-hidden', 'true');
  if (!isOverlayOpen()) {
    document.body.classList.remove('modal-open');
  }
  resolver(value);
}

function createFlightMarkerIcon() {
  const fallbackSrc = escapeHtml(assetUrl(PIDGEOT_FLIGHT_SPRITE));
  return L.divIcon({
    className: 'flight-marker-wrapper',
    html: `
      <div class="flight-marker" title="Pidgeot air travel">
        <img src="${fallbackSrc}" alt="Pidgeot air travel" onerror="this.onerror=null;this.src='${fallbackSrc}'" />
      </div>
    `,
    iconSize: [72, 72],
    iconAnchor: [36, 36],
  });
}

function getSpawnVisual(spot) {
  return createMediaDescriptor(
    [spot.spawnVideo, spot.spawnGif, spot.introVideo, spot.introGif, spot.image],
    { poster: null }
  );
}

function getThrowVisual(spot) {
  return createMediaDescriptor(
    [spot.throwVideo, spot.throwGif, spot.introVideo, spot.introGif, spot.image],
    { poster: null }
  );
}

function getCaptureVisual(spot) {
  return createMediaDescriptor([spot.captureVideo, spot.captureGif, DEFAULT_WAITING_VIDEO], {
    poster: null,
    loop: true,
  });
}

function getSuccessVisual(spot) {
  return createMediaDescriptor([spot.successVideo, spot.successGif], {
    poster: null,
  });
}

function getFailVisual(spot) {
  return createMediaDescriptor([spot?.failVideo, spot?.failGif], {
    poster: null,
  });
}

function getSpotSilhouetteSrc(spot) {
  return spot.silhouette || spot.image;
}

function getSilhouetteFallbackSrc(spot) {
  return spot?.silhouette || DEFAULT_SILHOUETTE_ASSET;
}

function isReplayAllowed(spot) {
  return Boolean(spot?.allowReplay) || REPLAYABLE_IDS.has(spot?.id);
}

function createMediaDescriptor(src, options = {}) {
  const sources = normalizeMediaSources(src);
  if (!sources.length) return null;

  return {
    src: sources[0],
    sources,
    type: options.type || detectMediaType(sources[0]),
    poster: options.poster ?? null,
    loop: Boolean(options.loop),
  };
}

function normalizeMediaDescriptor(input, options = {}) {
  if (!input) return null;

  if (typeof input === 'string') {
    return createMediaDescriptor(input, options);
  }

  if (Array.isArray(input)) {
    return createMediaDescriptor(input, options);
  }

  if (typeof input === 'object' && input.src) {
    const sources = normalizeMediaSources(input.sources || input.src);
    return {
      src: sources[0],
      sources,
      type: input.type || detectMediaType(sources[0]),
      poster: input.poster ?? options.poster ?? null,
      loop: typeof input.loop === 'boolean' ? input.loop : Boolean(options.loop),
    };
  }

  return null;
}

function normalizeMediaSources(input) {
  if (Array.isArray(input)) {
    return input.filter(Boolean).map(assetUrl);
  }

  return input ? [assetUrl(input)] : [];
}

function detectMediaType(src) {
  return VIDEO_EXTENSIONS.has(getFileExtension(src)) ? 'video' : 'image';
}

function getFileExtension(src) {
  if (!src) return '';
  const sanitized = src.split('#')[0].split('?')[0];
  const parts = sanitized.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function showCaptureVideo(descriptor, alt) {
  const video = elements.captureVideo;
  const img = elements.captureImage;
  const sources = normalizeMediaSources(descriptor.sources || descriptor.src);

  img.classList.add('hidden');
  img.src = '';
  img.alt = '';

  video.classList.remove('hidden');
  video.loop = Boolean(descriptor.loop);
  video.setAttribute('aria-label', alt || 'Pokemon encounter animation');
  if (alt) {
    video.setAttribute('title', alt);
  } else {
    video.removeAttribute('title');
  }
  video.removeAttribute('poster');

  let sourceIndex = 0;
  const trySource = () => {
    const nextSrc = sources[sourceIndex];
    sourceIndex += 1;

    if (!nextSrc) {
      hideCaptureMedia();
      return;
    }

    if (detectMediaType(nextSrc) !== 'video') {
      showCaptureImage(createMediaDescriptor(nextSrc), alt);
      return;
    }

    video.onerror = () => {
      video.onerror = null;
      trySource();
    };

    const currentSrc = video.getAttribute('src');
    if (currentSrc !== nextSrc) {
      video.pause();
      video.setAttribute('src', nextSrc);
      video.load();
    }

    const playPromise = video.play();
    if (typeof playPromise?.catch === 'function') {
      playPromise.catch(() => {});
    }
  };

  trySource();
}

function showCaptureImage(descriptor, alt) {
  const video = elements.captureVideo;
  video.pause();
  video.loop = false;
  video.classList.add('hidden');
  if (video.getAttribute('src')) {
    video.removeAttribute('src');
    video.load();
  } else {
    video.load();
  }
  video.removeAttribute('poster');
  video.removeAttribute('title');
  video.removeAttribute('aria-label');

  const img = elements.captureImage;
  img.classList.remove('hidden');
  img.src = descriptor.src;
  img.alt = alt || 'Pokemon encounter visual';
  img.classList.remove('is-silhouette');
  attachImageFallback(img, [state.selectedSpot?.pixelFallback, state.selectedSpot?.fallbackImage, state.selectedSpot?.image]);
}

function hideCaptureMedia() {
  const video = elements.captureVideo;
  const img = elements.captureImage;

  video.pause();
  video.loop = false;
  video.classList.add('hidden');
  if (video.getAttribute('src')) {
    video.removeAttribute('src');
    video.load();
  } else {
    video.load();
  }
  video.removeAttribute('poster');
  video.removeAttribute('title');
  video.removeAttribute('aria-label');

  img.classList.add('hidden');
  img.classList.remove('is-detail-artwork');
  img.classList.remove('is-silhouette');
  img.src = '';
  img.alt = '';
}

function attachImageFallback(img, fallbackSrc) {
  const fallbacks = Array.isArray(fallbackSrc)
    ? fallbackSrc.filter(Boolean).map(assetUrl)
    : [fallbackSrc].filter(Boolean).map(assetUrl);
  delete img.dataset.fallbackApplied;
  delete img.dataset.fallbackIndex;
  img.onerror = () => {
    const currentIndex = Number(img.dataset.fallbackIndex || 0);
    const nextSrc = fallbacks[currentIndex];
    if (!nextSrc) {
      img.onerror = null;
      return;
    }
    img.dataset.fallbackApplied = 'true';
    img.dataset.fallbackIndex = String(currentIndex + 1);
    img.src = nextSrc;
  };
}

function assetUrl(src) {
  if (!src || /^(?:[a-z][a-z\d+\-.]*:|\/\/)/i.test(src)) return src;
  const normalizedSrc = src.startsWith('/') ? src.slice(1) : src;
  return new URL(normalizedSrc, new URL(APP_BASE_URL, window.location.href)).href;
}

function joinList(list) {
  return Array.isArray(list) ? list.join(', ') : String(list || '???');
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatClockTime(date) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function playPokeballSound() {
  try {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    const ctx = state.audioCtx;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (error) {
    // Audio is optional in this prototype.
  }
}

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const toRadians = (value) => (value * Math.PI) / 180;
  const latDelta = toRadians(lat2 - lat1);
  const lngDelta = toRadians(lng2 - lng1);
  const startLat = toRadians(lat1);
  const endLat = toRadians(lat2);

  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(startLat) * Math.cos(endLat) *
      Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}
