// Keyboard + mouse state. Mouse position is in NDC; game raycasts it to the ground.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, left: false, right: false, leftPressed: false, rightPressed: false };

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
    if (k === ' ') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 0) { mouse.left = true; mouse.leftPressed = true; }
    if (e.button === 2) { mouse.right = true; mouse.rightPressed = true; }
  });
  addEventListener('pointerup', (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  });

  return {
    keys, mouse,
    down: (k) => keys.has(k),
    pressed: (k) => pressed.has(k),
    endFrame() { pressed.clear(); mouse.leftPressed = false; mouse.rightPressed = false; },
  };
}
