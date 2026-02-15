import GUI from 'lil-gui';
import type { Simulation } from '../simulation/Simulation';
import { setEnergyScale, ENERGY_SCALE, setSeedDispersalScale, SEED_DISPERSAL_SCALE } from '../simulation/Simulation';
import { setMaintenanceRate, MAINTENANCE_RATE, setGrowthCostRate, GROWTH_COST_RATE, setToppleBaseChance, TOPPLE_BASE_CHANCE, setLeafMassScale, LEAF_MASS_SCALE, setTrunkMassScale, TRUNK_MASS_SCALE, setBranchMassScale, BRANCH_MASS_SCALE, setUnrealizedPenalty, UNREALIZED_PENALTY } from '../simulation/Plant';
import { TRAIT_DEFS, type Traits } from '../simulation/Genome';

export interface SimControls {
  ticksPerFrame: number;
  paused: boolean;
  maxPlants: number;
  fps: number;
}

const STORAGE_KEY = 'plant-sim-controls';
const TUNING_STORAGE_KEY = 'plant-sim-tuning';
const PROFILES_STORAGE_KEY = 'plant-sim-tuning-profiles';
const FOLDERS_STORAGE_KEY = 'plant-sim-folders';
const ACTIVE_PROFILE_KEY = 'plant-sim-active-profile';

interface TuningState {
  energyScale: number;
  maintenanceRate: number;
  growthCostRate: number;
  toppleChance: number;
  unrealizedPenalty: number;
  mutationRate: number;
  trunkMassScale: number;
  leafMassScale: number;
  branchMassScale: number;
  seedDispersal: number;
}

function saveTuning(tuning: TuningState): void {
  try {
    localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify(tuning));
  } catch { /* ignore */ }
}

function loadTuning(): TuningState {
  const defaults: TuningState = {
    energyScale: Math.log10(ENERGY_SCALE),
    maintenanceRate: Math.log10(MAINTENANCE_RATE),
    growthCostRate: Math.log10(GROWTH_COST_RATE),
    toppleChance: Math.log10(TOPPLE_BASE_CHANCE),
    unrealizedPenalty: Math.log10(UNREALIZED_PENALTY),
    mutationRate: Math.log10(0.02),
    trunkMassScale: Math.log10(TRUNK_MASS_SCALE),
    leafMassScale: Math.log10(LEAF_MASS_SCALE),
    branchMassScale: Math.log10(BRANCH_MASS_SCALE),
    seedDispersal: Math.log10(SEED_DISPERSAL_SCALE),
  };
  try {
    const raw = localStorage.getItem(TUNING_STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaults;
}

function saveControls(controls: SimControls): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ticksPerFrame: controls.ticksPerFrame,
      paused: controls.paused,
      maxPlants: controls.maxPlants,
    }));
  } catch { /* ignore storage errors */ }
}

export function loadSavedControls(): Partial<SimControls> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

export const SPEED_STEPS = [1, 3, 10, 30, 100, 300, 1000];

export interface ControlsHandle {
  gui: GUI;
  updateDisplay(): void;
  setSpeed(index: number): void;
}

export function createControls(sim: Simulation, controls: SimControls): ControlsHandle {
  const gui = new GUI({ title: 'Plant Evolution Simulator', width: 340 });

  const persist = () => saveControls(controls);

  gui.add(controls, 'paused').name('Paused').onChange(persist);

  // Speed button row
  const speedRow = document.createElement('div');
  Object.assign(speedRow.style, {
    display: 'flex',
    gap: '2px',
    padding: '4px 8px 8px',
  });
  const speedButtons: HTMLButtonElement[] = [];

  function updateSpeedButtons() {
    for (let i = 0; i < SPEED_STEPS.length; i++) {
      const active = controls.ticksPerFrame === SPEED_STEPS[i];
      Object.assign(speedButtons[i].style, {
        background: active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.06)',
        color: active ? '#fff' : 'rgba(255,255,255,0.5)',
        fontWeight: active ? 'bold' : 'normal',
      });
    }
  }

  function setSpeed(index: number) {
    if (index < 0 || index >= SPEED_STEPS.length) return;
    controls.ticksPerFrame = SPEED_STEPS[index];
    updateSpeedButtons();
    persist();
  }

  for (let i = 0; i < SPEED_STEPS.length; i++) {
    const btn = document.createElement('button');
    btn.textContent = `${SPEED_STEPS[i]}`;
    Object.assign(btn.style, {
      flex: '1',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: '3px',
      padding: '3px 0',
      cursor: 'pointer',
      fontSize: '11px',
      fontFamily: 'monospace',
    });
    btn.title = `${SPEED_STEPS[i]} ticks/frame [${i + 1}]`;
    btn.addEventListener('click', () => setSpeed(i));
    speedRow.appendChild(btn);
    speedButtons.push(btn);
  }

  // Insert speed row after the paused controller
  const pausedEl = gui.controllers[0].domElement;
  pausedEl.parentElement!.insertBefore(speedRow, pausedEl.nextSibling);
  updateSpeedButtons();

  gui.add(controls, 'maxPlants', 10, 5000, 10).name('Max Plants').onChange((v: number) => {
    sim.config.maxPlants = v;
    persist();
  });

  const info = {
    get plants() { return sim.livingPlantCount; },
    get tick() { return sim.tick; },
    get seeds() { return sim.seeds.length; },
    get fps() { return Math.round(controls.fps); },
  };

  const statsFolder = gui.addFolder('Stats');
  statsFolder.add(info, 'fps').name('FPS').listen().disable();
  statsFolder.add(info, 'plants').name('Living Plants').listen().disable();
  statsFolder.add(info, 'tick').name('Tick').listen().disable();
  statsFolder.add(info, 'seeds').name('Seeds').listen().disable();

  const deathInfo = {
    get energy() { return sim.deathCounts.energy; },
    get age() { return sim.deathCounts.age; },
    get topple() { return sim.deathCounts.topple; },
    get germination() { return sim.deathCounts.germination; },
  };

  const deathFolder = gui.addFolder('Deaths');
  deathFolder.add(deathInfo, 'energy').name('Energy').listen().disable();
  deathFolder.add(deathInfo, 'age').name('Age').listen().disable();
  deathFolder.add(deathInfo, 'topple').name('Topple').listen().disable();
  deathFolder.add(deathInfo, 'germination').name('Germination').listen().disable();

  // Average trait values folder
  const avgFolder = gui.addFolder('Avg Traits');
  avgFolder.open();

  const avgObj: Record<string, string> = {};
  for (const def of TRAIT_DEFS) {
    avgObj[def.name] = def.integer ? '   0' : '0.00';
  }

  for (const def of TRAIT_DEFS) {
    const label = def.unit ? `${def.name} (${def.unit})` : def.name;
    avgFolder.add(avgObj, def.name).name(label).listen().disable();
  }

  function updateDisplay(): void {
    const living = sim.plants.filter(p => p.isAlive);
    const count = living.length;

    if (count === 0) {
      for (const def of TRAIT_DEFS) {
        avgObj[def.name] = def.integer ? '   0' : '   0.00';
      }
      return;
    }

    for (const def of TRAIT_DEFS) {
      let sum = 0;
      for (const plant of living) {
        sum += plant.traits[def.name as keyof Traits];
      }
      const avg = sum / count;
      avgObj[def.name] = def.integer
        ? Math.round(avg).toString().padStart(4)
        : avg.toFixed(2).padStart(7);
    }
  }

  // Log-scale tuning sliders (persisted)
  const tuningFolder = gui.addFolder('Tuning');
  const tuning = loadTuning();

  const fmtLog = (v: number) => (10 ** v).toPrecision(2);
  const persistTuning = () => saveTuning(tuning);

  const tuningDefs: Array<{ key: keyof TuningState; label: string; setter: (v: number) => void }> = [
    { key: 'energyScale', label: 'Energy Scale', setter: setEnergyScale },
    { key: 'maintenanceRate', label: 'Maintenance', setter: setMaintenanceRate },
    { key: 'growthCostRate', label: 'Growth Cost', setter: setGrowthCostRate },
    { key: 'toppleChance', label: 'Topple', setter: setToppleBaseChance },
    { key: 'unrealizedPenalty', label: 'Maturity Penalty', setter: setUnrealizedPenalty },
    { key: 'mutationRate', label: 'Evolution', setter: (v: number) => { sim.config.mutationRate = v; } },
    { key: 'trunkMassScale', label: 'Trunk Mass', setter: setTrunkMassScale },
    { key: 'leafMassScale', label: 'Leaf Mass', setter: setLeafMassScale },
    { key: 'branchMassScale', label: 'Branch Mass', setter: setBranchMassScale },
    { key: 'seedDispersal', label: 'Seed Spread', setter: setSeedDispersalScale },
  ];

  function applyTuning() {
    for (const { key, setter } of tuningDefs) {
      setter(10 ** tuning[key]);
    }
    // Update slider positions and labels
    for (let i = 0; i < tuningDefs.length; i++) {
      const { key, label } = tuningDefs[i];
      tuningFolder.controllers[i].setValue(tuning[key]);
      tuningFolder.controllers[i].name(`${label} (${fmtLog(tuning[key])})`);
    }
    persistTuning();
  }

  // Apply saved values on startup (must happen after tuningDefs is defined)
  for (const { setter, key } of tuningDefs) {
    setter(10 ** tuning[key]);
  }

  let loadingProfile = false;

  for (let i = 0; i < tuningDefs.length; i++) {
    const { key, label, setter } = tuningDefs[i];
    tuningFolder.add(tuning, key, -4, 2, 0.05)
      .name(`${label} (${fmtLog(tuning[key])})`)
      .decimals(2)
      .onChange((v: number) => {
        setter(10 ** v);
        tuningFolder.controllers[i].name(`${label} (${fmtLog(v)})`);
        persistTuning();
        if (!loadingProfile && profileState.current) {
          profileState.current = '';
          try { localStorage.setItem(ACTIVE_PROFILE_KEY, ''); } catch { /* ignore */ }
          profileFolder.controllers[0].updateDisplay();
        }
      });
  }

  // --- Tuning profiles ---
  function loadProfiles(): Record<string, TuningState> {
    try {
      const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {};
  }

  function saveProfiles(profiles: Record<string, TuningState>) {
    try {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    } catch { /* ignore */ }
  }

  const profileFolder = tuningFolder.addFolder('Profiles');
  let savedProfileName = '';
  try { savedProfileName = localStorage.getItem(ACTIVE_PROFILE_KEY) ?? ''; } catch { /* ignore */ }
  const profileState = { current: savedProfileName };

  function getProfileNames(): string[] {
    return Object.keys(loadProfiles());
  }

  function rebuildProfileDropdown() {
    const names = getProfileNames();
    const options = names.length > 0 ? ['', ...names] : [''];
    // Remove and re-add the dropdown controller (index 0 in profileFolder)
    if (profileFolder.controllers.length > 0) {
      profileFolder.controllers[0].destroy();
    }
    profileFolder.add(profileState, 'current', options)
      .name('Profile')
      .onChange((name: string) => {
        try { localStorage.setItem(ACTIVE_PROFILE_KEY, name); } catch { /* ignore */ }
        if (!name) return;
        const profiles = loadProfiles();
        const profile = profiles[name];
        if (profile) {
          Object.assign(tuning, profile);
          loadingProfile = true;
          applyTuning();
          loadingProfile = false;
        }
      });
  }

  rebuildProfileDropdown();

  const profileActions = {
    save() {
      const name = prompt('Profile name:');
      if (!name) return;
      const profiles = loadProfiles();
      profiles[name] = { ...tuning };
      saveProfiles(profiles);
      profileState.current = name;
      rebuildProfileDropdown();
    },
    rename() {
      if (!profileState.current) return;
      const newName = prompt('New name:', profileState.current);
      if (!newName || newName === profileState.current) return;
      const profiles = loadProfiles();
      profiles[newName] = profiles[profileState.current];
      delete profiles[profileState.current];
      saveProfiles(profiles);
      profileState.current = newName;
      rebuildProfileDropdown();
    },
    delete() {
      if (!profileState.current) return;
      if (!confirm(`Delete profile "${profileState.current}"?`)) return;
      const profiles = loadProfiles();
      delete profiles[profileState.current];
      saveProfiles(profiles);
      profileState.current = '';
      rebuildProfileDropdown();
    },
  };

  profileFolder.add(profileActions, 'save').name('Save As...');
  profileFolder.add(profileActions, 'rename').name('Rename');
  profileFolder.add(profileActions, 'delete').name('Delete');

  // Persist folder open/close state
  function saveFolderState() {
    const state: Record<string, boolean> = {};
    for (const folder of gui.foldersRecursive()) {
      state[folder._title] = !folder._closed;
    }
    try { localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }

  function loadFolderState() {
    try {
      const raw = localStorage.getItem(FOLDERS_STORAGE_KEY);
      if (!raw) return;
      const state: Record<string, boolean> = JSON.parse(raw);
      for (const folder of gui.foldersRecursive()) {
        if (folder._title in state) {
          state[folder._title] ? folder.open() : folder.close();
        }
      }
    } catch { /* ignore */ }
  }

  loadFolderState();

  // Listen for folder toggles
  for (const folder of gui.foldersRecursive()) {
    folder.onOpenClose(() => saveFolderState());
  }

  return { gui, updateDisplay, setSpeed };
}
