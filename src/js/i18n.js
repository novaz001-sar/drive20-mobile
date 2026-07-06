// ====================================================================
// Interface copy
// ====================================================================
const englishCopy = {
    welcome: (nickname) => `Hello, ${nickname}!`,
    levelComplete: "Level Complete!",
    levelCompleteWithName: (nickname) => `Great drive, ${nickname}! Level Complete!`,
    freeModeComplete: "Free mode practice complete.",
    select: "Select",
    forward: "Forward",
    turnLeft: "Turn Left",
    turnRight: "Turn Right",
    turnAround: "Turn Around",
    helperText: "Swipe on any empty area to drive: up to move forward, left/right to turn, down to back up. Keyboard controls still work.",
    level: "Level",
    confirmReset: "Are you sure you want to reset all game data? This action cannot be undone.",
    editor_need_start: "Map needs a starting point.",
    editor_need_goal: "Map needs a goal point.",
    editor_unsolvable: "Map is unsolvable! Make sure the start and goal are connected.",
    map_slot: "Map Slot",
    empty_slot: "Empty Slot",
    confirm_delete: "Are you sure you want to delete this map?",
    editor_slots_full: "All custom map slots are full.",
    desc_free: "Freely select any unlocked level for practice without the pressure of steps and scores.",
    desc_custom: "Play, edit, or delete the maps you've created in the map editor.",
    desc_editor: "Unleash your creativity. Design, build, and save your own maze maps.",
    prompt_wall: "There is a wall ahead. Please choose another direction.",
    prompt_options: (options) => `Available moves: ${options.join(' | ')}`,
    hint_ingame_controls: "Hint: Tap Settings to adjust options. Tap Menu to pause.",
    hint_driving_start: "Hint: Swipe on any empty area to drive. Yellow arrows show available directions, not a route.",
    prompt_dead_end: "Dead end. Swipe left or right twice to turn around.",
    prompt_near_goal: "One more step to the destination.",
    waypoint_hud: (next, total) => `Find Waypoint: ${next} / ${total}`,
    prompt_goal_locked: "Please visit all waypoints in order first.",
    editor_waypoint_on_special: "Cannot place a waypoint on the start or goal."
};

export const translations = {
    en: englishCopy,
    // Keep zh as a compatibility alias for old saved UI state.
    zh: englishCopy
};
