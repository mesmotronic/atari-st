import * as THREE from "three";

import CameraControls from "camera-controls";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CSS3DObject, CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

let camera, scene, rendererCSS3D, rendererWebGL;
let controls;
let iframe;
let clock;

// Animated objects
let curtainLeft, curtainRight;
let curtainLeftOrigPos, curtainRightOrigPos;
let minuteHandGroup, hourHandGroup;
let particleGeometry, particlePositions, particleSeeds;

// Scene constants
const WORLD_SHIFT_X = 2340;
const WORLD_SHIFT_Z = 2750;
const FLOOR_Y = -2050;
const CEILING_Y = 1900;
const ROOM_W = 6000;
const ROOM_D = 6100;
const WALL_LEFT_X = -4000 + WORLD_SHIFT_X; // fixed — next to desk
const WALL_BACK_Z = -3750 + WORLD_SHIFT_Z; // fixed — next to desk
const WALL_RIGHT_X = WALL_LEFT_X + ROOM_W; // +2100
const ROOM_CX = (WALL_LEFT_X + WALL_RIGHT_X) / 2; // -950
const ROOM_CZ = WALL_BACK_Z + ROOM_D / 2; // -700
const ROOM_H = CEILING_Y - FLOOR_Y; // 3950

// Desk sits in the back-left corner
const DESK_CX = -2440 + WORLD_SHIFT_X;
const DESK_CZ = -2900 + WORLD_SHIFT_Z;
const DESK_Y = -550;
const SCREEN_X = DESK_CX + 100;
const SCREEN_Y = 0;
const SCREEN_Z = DESK_CZ + 150;

/**
 * Atari ST-like RAL 7038 coloured matt plastic material
 */
const atariMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xafb0a8,
  roughness: 0.35,
  metalness: 0.05,
  clearcoat: 0.15,
  clearcoatRoughness: 0.5,
});

const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
gltfLoader.setDRACOLoader(dracoLoader);

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined, reject);
  });
}

function resizeHandler() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  rendererWebGL.setSize(window.innerWidth, window.innerHeight);
  rendererCSS3D.setSize(window.innerWidth, window.innerHeight);
}

function animateCurtainPanel(mesh, origPositions, t, phase) {
  const pos = mesh.geometry.attributes.position;
  const segRows = 20;
  const segCols = 8;
  for (let row = 0; row <= segRows; row++) {
    const vFrac = row / segRows;
    const amp = vFrac * vFrac * 35;
    for (let col = 0; col <= segCols; col++) {
      const idx = row * (segCols + 1) + col;
      const ox = origPositions[idx * 3];
      const oy = origPositions[idx * 3 + 1];
      const oz = origPositions[idx * 3 + 2];
      pos.setXYZ(
        idx,
        ox + Math.sin(t * 0.7 + vFrac * 3.0 + phase) * amp,
        oy,
        oz + Math.cos(t * 0.5 + vFrac * 2.0 + phase) * amp * 0.5,
      );
    }
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

function animateClock() {
  if (!minuteHandGroup || !hourHandGroup) return;
  const now = new Date();
  const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;
  // Clock is on right wall, viewed from -X; positive rotation.x = clockwise
  minuteHandGroup.rotation.x = (minutes / 60) * Math.PI * 2;
  hourHandGroup.rotation.x = (hours / 12) * Math.PI * 2;
}

function animateDustParticles(t) {
  if (!particleGeometry) return;
  const pos = particlePositions;
  const count = particleSeeds.length;
  for (let i = 0; i < count; i++) {
    pos[i * 3 + 1] += 0.25;
    pos[i * 3] += Math.sin(t * 0.25 + particleSeeds[i]) * 0.18;
    pos[i * 3 + 2] += Math.cos(t * 0.2 + particleSeeds[i]) * 0.18;
    if (pos[i * 3 + 1] > 1500) {
      pos[i * 3 + 1] = FLOOR_Y + 50;
      pos[i * 3] = (Math.random() - 0.5) * 5000 + ROOM_CX;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4000 + ROOM_CZ;
    }
  }
  particleGeometry.attributes.position.needsUpdate = true;
}

function animate() {
  const delta = clock.getDelta();
  const t = clock.getElapsedTime();
  controls.update(delta);

  if (curtainLeft) animateCurtainPanel(curtainLeft, curtainLeftOrigPos, t, 0);
  if (curtainRight) animateCurtainPanel(curtainRight, curtainRightOrigPos, t, Math.PI * 0.6);
  animateClock();
  animateDustParticles(t);

  rendererWebGL.render(scene, camera);
  rendererCSS3D.render(scene, camera);
}

function applyAtariMaterial(parent) {
  parent.traverse((child) => {
    if (child.isMesh) {
      const m = atariMaterial.clone();
      m.side = child.material?.side ?? THREE.FrontSide;
      child.material = m;
    }
  });
}

function enableShadows(parent) {
  parent.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function createRoom() {
  const group = new THREE.Group();

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8ddd0, roughness: 0.88, metalness: 0 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.92, metalness: 0 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0xf2ece4, roughness: 0.7, metalness: 0 });

  // Back wall
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_H), wallMat);
  backWall.position.set(ROOM_CX, FLOOR_Y + ROOM_H / 2, WALL_BACK_Z);
  backWall.receiveShadow = true;
  group.add(backWall);

  // Left wall
  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, ROOM_H), wallMat);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(WALL_LEFT_X, FLOOR_Y + ROOM_H / 2, ROOM_CZ);
  leftWall.receiveShadow = true;
  group.add(leftWall);

  // Right wall
  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, ROOM_H), wallMat);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(WALL_RIGHT_X, FLOOR_Y + ROOM_H / 2, ROOM_CZ);
  rightWall.receiveShadow = true;
  group.add(rightWall);

  // Ceiling
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(ROOM_CX, CEILING_Y, ROOM_CZ);
  group.add(ceiling);

  // Floor planks
  const plankW = 375;
  const plankColors = [0x6b4c35, 0x7a5a42];
  const plankCount = ROOM_W / plankW;
  for (let i = 0; i < plankCount; i++) {
    const c = plankColors[i % 2];
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(plankW - 4, 6, ROOM_D),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.82, metalness: 0 }),
    );
    plank.position.set(WALL_LEFT_X + plankW * i + plankW / 2, FLOOR_Y + 3, ROOM_CZ);
    plank.receiveShadow = true;
    group.add(plank);
  }

  // Skirting boards
  const skirtH = 80;
  const skirtD = 18;
  const skirtY = FLOOR_Y + skirtH / 2;
  const sb1 = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, skirtH, skirtD), skirtMat);
  sb1.position.set(ROOM_CX, skirtY, WALL_BACK_Z + skirtD / 2);
  sb1.castShadow = true;
  sb1.receiveShadow = true;
  group.add(sb1);
  const sb2 = new THREE.Mesh(new THREE.BoxGeometry(skirtD, skirtH, ROOM_D), skirtMat);
  sb2.position.set(WALL_LEFT_X + skirtD / 2, skirtY, ROOM_CZ);
  sb2.castShadow = true;
  sb2.receiveShadow = true;
  group.add(sb2);
  const sb3 = new THREE.Mesh(new THREE.BoxGeometry(skirtD, skirtH, ROOM_D), skirtMat);
  sb3.position.set(WALL_RIGHT_X - skirtD / 2, skirtY, ROOM_CZ);
  sb3.castShadow = true;
  sb3.receiveShadow = true;
  group.add(sb3);

  scene.add(group);
}

function createWindow() {
  const wy = FLOOR_Y + 2100;
  const wz = WALL_BACK_Z + ROOM_D * 0.75;
  const wW = 1400;
  const wH = 1800;

  const winGroup = new THREE.Group();
  winGroup.position.set(WALL_LEFT_X, 0, wz);
  winGroup.rotation.y = Math.PI / 2;
  scene.add(winGroup);

  const fZ = 1;

  // Frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.7, metalness: 0 });
  const frameThick = 55;
  const frameDepth = 70;
  const frameParts = [
    [wW + frameThick * 2, frameThick, frameDepth, 0, wy + wH / 2 + frameThick / 2, fZ],
    [wW + frameThick * 2, frameThick, frameDepth, 0, wy - wH / 2 - frameThick / 2, fZ],
    [frameThick, wH + frameThick * 2, frameDepth, -wW / 2 - frameThick / 2, wy, fZ],
    [frameThick, wH + frameThick * 2, frameDepth, wW / 2 + frameThick / 2, wy, fZ],
    [30, wH, 40, 0, wy, fZ + 10],
    [wW, 30, 40, 0, wy + 100, fZ + 10],
  ];
  for (const [fw, fh, fd, fx, fy, fz] of frameParts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, fd), frameMat);
    m.position.set(fx, fy, fz);
    m.castShadow = true;
    winGroup.add(m);
  }

  // Glass panes
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x08161a,
    transmission: 0.95,
    opacity: 1,
    transparent: true,
    roughness: 0.05,
    metalness: 0,
    ior: 1.5,
    thickness: 2,
    depthWrite: false,
  });
  const paneW = (wW - 30) / 2 - 10;
  const paneH = wH - 30;
  const pane1 = new THREE.Mesh(new THREE.PlaneGeometry(paneW, paneH), glassMat);
  pane1.position.set(-wW / 4 - 5, wy, fZ + 15);
  winGroup.add(pane1);
  const pane2 = new THREE.Mesh(new THREE.PlaneGeometry(paneW, paneH), glassMat);
  pane2.position.set(wW / 4 + 5, wy, fZ + 15);
  winGroup.add(pane2);

  // Curtain rod — wide enough to hold curtains on either side, 50% thicker
  const curtainW = 560;
  const totalCurtainSpan = wW + curtainW * 2 + 200;
  const rodMat = new THREE.MeshStandardMaterial({ color: 0x8b7040, roughness: 0.3, metalness: 0.7 });
  const rodY = wy + wH / 2 + 120;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(21, 21, totalCurtainSpan, 12), rodMat);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, rodY, 60);
  winGroup.add(rod);
  for (const side of [-1, 1]) {
    const finial = new THREE.Mesh(new THREE.SphereGeometry(30, 10, 8), rodMat);
    finial.position.set(side * (totalCurtainSpan / 2 + 10), rodY, 60);
    winGroup.add(finial);
  }

  // Curtain panels — top at rod height, with static wave folds
  const curtainMat = new THREE.MeshStandardMaterial({
    color: 0x1E3A5F,
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const curtainBottom = wy - wH / 2 - frameThick - 80;
  const curtainH = rodY - curtainBottom;
  const curtainCenterY = curtainBottom + curtainH / 2;
  const segCols = 16;
  const segRows = 20;

  function applyCurtainWave(geo) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const uFrac = (x / (curtainW / 2) + 1) / 2;
      pos.setZ(i, Math.sin(uFrac * Math.PI * 5) * 25);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  const cGeoL = new THREE.PlaneGeometry(curtainW, curtainH, segCols, segRows);
  applyCurtainWave(cGeoL);
  curtainLeft = new THREE.Mesh(cGeoL, curtainMat);
  curtainLeft.position.set(-wW / 2 - curtainW / 2 + 40, curtainCenterY, 55);
  curtainLeft.castShadow = true;
  winGroup.add(curtainLeft);
  curtainLeftOrigPos = new Float32Array(curtainLeft.geometry.attributes.position.array);

  const cGeoR = new THREE.PlaneGeometry(curtainW, curtainH, segCols, segRows);
  applyCurtainWave(cGeoR);
  curtainRight = new THREE.Mesh(cGeoR, curtainMat);
  curtainRight.position.set(wW / 2 + curtainW / 2 - 40, curtainCenterY, 55);
  curtainRight.castShadow = true;
  winGroup.add(curtainRight);
  curtainRightOrigPos = new Float32Array(curtainRight.geometry.attributes.position.array);
}

function createBookshelf() {
  const group = new THREE.Group();

  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x5c3d20, roughness: 0.7, metalness: 0 });
  const shelfX = WALL_RIGHT_X - 1200;
  const shelfZ = WALL_BACK_Z + 250;
  const shelfW = 1375;
  const shelfFullH = 2400;
  const shelfDepth = 380;
  const shelfBaseY = FLOOR_Y + shelfFullH / 2;

  // Panels
  const panels = [
    [shelfW, 22, shelfDepth, shelfX, FLOOR_Y + shelfFullH - 11, shelfZ],
    [shelfW, 22, shelfDepth, shelfX, FLOOR_Y + 11, shelfZ],
    [22, shelfFullH, shelfDepth, shelfX - shelfW / 2 + 11, shelfBaseY, shelfZ],
    [22, shelfFullH, shelfDepth, shelfX + shelfW / 2 - 11, shelfBaseY, shelfZ],
    [22, shelfFullH, 22, shelfX - shelfW / 2 - 11, shelfBaseY, shelfZ + shelfDepth / 2 - 11],
  ];
  for (const [w, h, d, x, y, z] of panels) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shelfMat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  // Back panel
  const back = new THREE.Mesh(new THREE.BoxGeometry(shelfW - 44, shelfFullH, 14), shelfMat);
  back.position.set(shelfX, shelfBaseY, shelfZ - shelfDepth / 2 + 7);
  back.receiveShadow = true;
  group.add(back);

  // Internal shelves
  const shelfCount = 5;
  const shelfSpacing = shelfFullH / (shelfCount + 1);
  const shelfYPositions = [];
  for (let i = 1; i <= shelfCount; i++) {
    const sy = FLOOR_Y + shelfSpacing * i;
    shelfYPositions.push(sy);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(shelfW - 44, 22, shelfDepth), shelfMat);
    shelf.position.set(shelfX, sy, shelfZ);
    shelf.castShadow = true;
    shelf.receiveShadow = true;
    group.add(shelf);
  }

  // Books
  const bookColors = [
    0x8b0000, 0x2f4f4f, 0xdaa520, 0x4b3832, 0x556b2f, 0x800020, 0xc19a6b, 0x1c3a5e, 0x704214, 0x5b2333, 0x3b5998,
    0x8b4513,
  ];
  const rng = (() => {
    let s = 42;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  })();

  for (const sy of shelfYPositions) {
    let curX = shelfX - shelfW / 2 + 30;
    const maxX = shelfX + shelfW / 2 - 30;
    let layFlat = rng() > 0.6;
    while (curX < maxX - 40) {
      const bW = 40 + rng() * 45;
      const bH = 200 + rng() * 130;
      const bD = shelfDepth - 40;
      if (layFlat && rng() > 0.5) {
        const stackCount = 2 + Math.floor(rng() * 2);
        for (let s = 0; s < stackCount; s++) {
          const fw = 80 + rng() * 60;
          const fh = 20 + rng() * 12;
          const fd = bD * (0.7 + rng() * 0.3);
          const bk = new THREE.Mesh(
            new THREE.BoxGeometry(fw, fh, fd),
            new THREE.MeshStandardMaterial({
              color: bookColors[Math.floor(rng() * bookColors.length)],
              roughness: 0.85,
            }),
          );
          bk.position.set(curX + fw / 2, sy + 11 + fh * (s + 0.5), shelfZ + (rng() - 0.5) * 20);
          bk.receiveShadow = true;
          bk.castShadow = true;
          group.add(bk);
        }
        curX += 110 + rng() * 40;
        layFlat = false;
      } else {
        const tilt = (rng() - 0.5) * 0.22;
        const bk = new THREE.Mesh(
          new THREE.BoxGeometry(bW, bH, bD),
          new THREE.MeshStandardMaterial({ color: bookColors[Math.floor(rng() * bookColors.length)], roughness: 0.85 }),
        );
        bk.position.set(curX + bW / 2, sy + 11 + (bH / 2) * Math.cos(tilt), shelfZ + (rng() - 0.5) * 20);
        bk.rotation.z = tilt;
        bk.castShadow = true;
        bk.receiveShadow = true;
        group.add(bk);
        curX += bW + 4 + rng() * 10;
      }
    }
  }

  scene.add(group);
}

async function createPoster() {
  const pW = 1300;
  const pH = 1500;
  const px = WALL_RIGHT_X - 2;
  const py = FLOOR_Y + ROOM_H / 2 + 200;
  const pz = -2200 + WORLD_SHIFT_Z;

  // Black background — no frame
  const matBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(pW, pH), // rotated: height along Z, width along Y
    new THREE.MeshStandardMaterial({ color: 0x111111 }),
  );
  matBoard.position.set(px, py, pz);
  matBoard.rotation.y = -Math.PI / 2;
  scene.add(matBoard);

  const map = await loadTexture("textures/atari.png");
  const posterMat = new THREE.MeshStandardMaterial({ map, transparent: true });
  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(pW * 0.75, (pW * 1.2) * 0.75),
    posterMat,
  );
  poster.position.set(px - 1, py, pz);
  poster.rotation.y = -Math.PI / 2;
  scene.add(poster);
}

function createRug() {
  const group = new THREE.Group();

  const rugY = FLOOR_Y + 8;
  // Rug in front of the sofa — square, based on longest side (3000)
  // Sofa faces -X (rotated -90° on Y, against right wall), so "in front" is toward -X
  const sofaCX = WALL_RIGHT_X - 620 * 0.75 - 40;
  const rugCX = sofaCX - 2000; // in front of the sofa
  const rugCZ = 500 + WORLD_SHIFT_Z; // match sofa Z
  const layers = [
    { s: 3000, y: rugY, color: 0xa03a22 },
    { s: 2800, y: rugY + 2, color: 0xc4793a },
    { s: 2500, y: rugY + 4, color: 0xa03a22 },
    { s: 1800, y: rugY + 6, color: 0xc4793a },
  ];
  for (const { s, y, color } of layers) {
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(s, s),
      new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(rugCX, y, rugCZ);
    rug.receiveShadow = true;
    group.add(rug);
  }

  const medallion = new THREE.Mesh(
    new THREE.CircleGeometry(480, 48),
    new THREE.MeshStandardMaterial({ color: 0xc4793a, roughness: 0.95 }),
  );
  medallion.rotation.x = -Math.PI / 2;
  medallion.position.set(rugCX, rugY + 7, rugCZ);
  group.add(medallion);

  const medallionInner = new THREE.Mesh(
    new THREE.CircleGeometry(320, 48),
    new THREE.MeshStandardMaterial({ color: 0xa03a22, roughness: 0.95 }),
  );
  medallionInner.rotation.x = -Math.PI / 2;
  medallionInner.position.set(rugCX, rugY + 8, rugCZ);
  group.add(medallionInner);

  scene.add(group);
}

function createPendantLight() {
  const group = new THREE.Group();

  const lx = ROOM_CX;
  const lz = ROOM_CZ;
  const bulbY = CEILING_Y - 820;

  // Cord
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5, 600, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }),
  );
  cord.position.set(lx, CEILING_Y - 300, lz);
  group.add(cord);

  // Shade outer (matte black)
  const shadeOutMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.FrontSide,
  });
  const shadeOut = new THREE.Mesh(new THREE.CylinderGeometry(40, 260, 300, 32, 1, true), shadeOutMat);
  shadeOut.position.set(lx, CEILING_Y - 750, lz);
  shadeOut.castShadow = true;
  group.add(shadeOut);

  // Shade inner (warm glow)
  const shadeInMat = new THREE.MeshStandardMaterial({
    color: 0xf0c060,
    roughness: 0.9,
    side: THREE.BackSide,
    emissive: 0xf0c060,
    emissiveIntensity: 0.8,
  });
  const shadeIn = new THREE.Mesh(new THREE.CylinderGeometry(40, 260, 300, 32, 1, true), shadeInMat);
  shadeIn.position.set(lx, CEILING_Y - 750, lz);
  group.add(shadeIn);

  // Shade top cap
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(40, 40, 20, 32),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.1 }),
  );
  cap.position.set(lx, CEILING_Y - 605, lz);
  cap.castShadow = true;
  group.add(cap);

  // Bulb
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(32, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffcc44, emissiveIntensity: 3.0 }),
  );
  bulb.position.set(lx, bulbY, lz);
  group.add(bulb);

  scene.add(group);

  // Lights added directly to scene (not in group) so targets work correctly
  // SpotLight pointing straight down — positioned just below shade opening
  // Intensity scaled for ~3000-unit drop to floor with quadratic decay
  const shadeBottomY = CEILING_Y - 750 - 150; // shade centre − half height
  const spotLight = new THREE.SpotLight(0xffd580, 8000000, 0, Math.PI / 3, 0.4, 2);
  spotLight.position.set(lx, shadeBottomY + 10, lz);
  spotLight.target.position.set(lx, FLOOR_Y, lz);
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.set(2048, 2048);
  spotLight.shadow.camera.near = 100;
  spotLight.shadow.camera.far = 8000;
  scene.add(spotLight);
  scene.add(spotLight.target);

  // PointLight for a restrained amount of omnidirectional bulb spill
  const fillLight = new THREE.PointLight(0xffd580, 450000, 0, 2);
  fillLight.position.set(lx, bulbY, lz);
  scene.add(fillLight);

}

function createSofa() {
  const sofaGroup = new THREE.Group();
  const sofaW = 1800;
  const sofaD = 620;
  const legH = 120;
  const baseH = 80;
  const baseTop = legH + baseH;
  const seatY = baseTop;

  const cushMat = new THREE.MeshStandardMaterial({ color: 0x7a6050, roughness: 0.78, metalness: 0 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3d2010, roughness: 0.65, metalness: 0 });
  const pillowColors = [0xc4a882, 0xa07858, 0xd4b896];

  // Legs — visible, below the base
  const legGeo = new THREE.CylinderGeometry(24, 20, legH, 12);
  for (const [lx, lz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const leg = new THREE.Mesh(legGeo, frameMat);
    leg.position.set(lx * (sofaW / 2 - 80), legH / 2, lz * (sofaD / 2 - 60));
    leg.castShadow = true;
    sofaGroup.add(leg);
  }

  // Base / frame — raised above legs
  const base = new THREE.Mesh(new THREE.BoxGeometry(sofaW, baseH, sofaD), frameMat);
  base.position.set(0, legH + baseH / 2, 0);
  base.castShadow = true;
  base.receiveShadow = true;
  sofaGroup.add(base);

  // Seat cushions
  const cushW = (sofaW - 60) / 3;
  for (let i = 0; i < 3; i++) {
    const cx = -sofaW / 2 + 30 + cushW * i + cushW / 2;
    const cush = new THREE.Mesh(new RoundedBoxGeometry(cushW - 14, 100, sofaD - 80, 5, 25), cushMat);
    cush.position.set(cx, seatY + 50, 20);
    cush.castShadow = true;
    cush.receiveShadow = true;
    sofaGroup.add(cush);
  }

  // Back rest
  const back = new THREE.Mesh(new RoundedBoxGeometry(sofaW, 480, 130, 5, 25), cushMat);
  back.position.set(0, seatY + 300, -sofaD / 2 + 30);
  back.rotation.x = THREE.MathUtils.degToRad(-6);
  back.castShadow = true;
  sofaGroup.add(back);

  // Arms
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new RoundedBoxGeometry(130, 340, sofaD, 4, 18), cushMat);
    arm.position.set(side * (sofaW / 2 + 65), seatY + 80, 0);
    arm.castShadow = true;
    sofaGroup.add(arm);
  }

  // Throw pillows
  const pillowOffsets = [-500, 0, 500];
  for (let i = 0; i < 3; i++) {
    const pMat = new THREE.MeshStandardMaterial({ color: pillowColors[i], roughness: 0.8 });
    const pillow = new THREE.Mesh(new RoundedBoxGeometry(280, 260, 75, 4, 25), pMat);
    pillow.position.set(pillowOffsets[i], seatY + 220, -sofaD / 2 + 80);
    pillow.rotation.z = (i - 1) * 0.08;
    pillow.rotation.x = THREE.MathUtils.degToRad(-15);
    pillow.castShadow = true;
    sofaGroup.add(pillow);
  }

  sofaGroup.scale.set(1.5, 1.5, 1.5);
  sofaGroup.rotation.y = -Math.PI / 2;
  sofaGroup.position.set(WALL_RIGHT_X - (sofaD * 1.5) / 2 - 40, FLOOR_Y, 500 + WORLD_SHIFT_Z);
  scene.add(sofaGroup);
}

function createSideTable() {
  const group = new THREE.Group();

  const tx = WALL_RIGHT_X - 520;
  const tz = -1500 + WORLD_SHIFT_Z;
  const tableTopY = FLOOR_Y + 560;

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3d20, roughness: 0.62, metalness: 0 });

  const top = new THREE.Mesh(new THREE.CylinderGeometry(210, 210, 30, 40), woodMat);
  top.position.set(tx, tableTopY, tz);
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  const ped = new THREE.Mesh(new THREE.CylinderGeometry(28, 55, 520, 16), woodMat);
  ped.position.set(tx, tableTopY - 275, tz);
  ped.castShadow = true;
  group.add(ped);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(160, 160, 22, 32), woodMat);
  base.position.set(tx, FLOOR_Y + 11, tz);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const mugMat = new THREE.MeshStandardMaterial({ color: 0xe8ddd0, roughness: 0.7 });
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(38, 32, 88, 20), mugMat);
  mug.position.set(tx - 60, tableTopY + 59, tz + 30);
  mug.castShadow = true;
  group.add(mug);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(32, 8, 8, 16, Math.PI), mugMat);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(tx - 60 + 44, tableTopY + 59, tz + 30);
  group.add(handle);
  const coffee = new THREE.Mesh(
    new THREE.CircleGeometry(28, 20),
    new THREE.MeshStandardMaterial({ color: 0x3a1f0a, roughness: 0.3 }),
  );
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.set(tx - 60, tableTopY + 103, tz + 30);
  group.add(coffee);

  const bookOnTable = new THREE.Mesh(
    new THREE.BoxGeometry(180, 22, 230),
    new THREE.MeshStandardMaterial({ color: 0x2f4f4f, roughness: 0.85 }),
  );
  bookOnTable.rotation.y = 0.3;
  bookOnTable.position.set(tx + 40, tableTopY + 26, tz - 30);
  bookOnTable.castShadow = true;
  group.add(bookOnTable);

  scene.add(group);
}

function createFilingCabinet() {
  const group = new THREE.Group();

  const fx = DESK_CX + 1480;
  const fz = DESK_CZ - 200;
  const cabinetH = 1200;
  const cabinetW = 450;
  const cabinetD = 560;
  const cabinetY = FLOOR_Y + cabinetH / 2;

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a9ba8, roughness: 0.55, metalness: 0.35 });
  const drawerMat = new THREE.MeshStandardMaterial({ color: 0x7a8b98, roughness: 0.5, metalness: 0.4 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.1, metalness: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(cabinetW, cabinetH, cabinetD), bodyMat);
  body.position.set(fx, cabinetY, fz);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const drawerCount = 3;
  const drawerH = (cabinetH - 60) / drawerCount - 12;
  for (let i = 0; i < drawerCount; i++) {
    const dy = FLOOR_Y + 30 + drawerH / 2 + i * (drawerH + 12);
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(cabinetW - 10, drawerH, 22), drawerMat);
    drawer.position.set(fx, dy, fz + cabinetD / 2 + 4);
    group.add(drawer);

    const dHandle = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 90, 10), chromeMat);
    dHandle.rotation.z = Math.PI / 2;
    dHandle.position.set(fx, dy, fz + cabinetD / 2 + 18);
    group.add(dHandle);
  }

  const topSurf = new THREE.Mesh(new THREE.BoxGeometry(cabinetW, 16, cabinetD), bodyMat);
  topSurf.position.set(fx, FLOOR_Y + cabinetH + 8, fz);
  topSurf.castShadow = true;
  topSurf.receiveShadow = true;
  group.add(topSurf);

  scene.add(group);
}

function createWallClock() {
  const group = new THREE.Group();

  const cx = WALL_RIGHT_X - 2;
  const cy = FLOOR_Y + 2900;
  const cz = 500 + WORLD_SHIFT_Z;
  const radius = 400;

  const faceMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.7, metalness: 0 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.5, metalness: 0.1 });
  const handMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });
  const markerMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });

  // Face
  const face = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 18, 64), faceMat);
  face.rotation.z = Math.PI / 2;
  face.position.set(cx, cy, cz);
  face.castShadow = true;
  group.add(face);

  // Rim
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius + 8, 16, 8, 64), rimMat);
  rim.rotation.y = Math.PI / 2;
  rim.position.set(cx, cy, cz);
  group.add(rim);

  // Hour markers — 12 o'clock is at top (+Y), going clockwise when viewed from -X
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const mr = radius - 28;
    const markerGeo = i % 3 === 0 ? new THREE.BoxGeometry(10, 45, 8) : new THREE.BoxGeometry(6, 28, 8);
    const marker = new THREE.Mesh(markerGeo, markerMat);
    // 12 at top, 3 at -Z, 6 at bottom, 9 at +Z (clockwise from -X view)
    marker.position.set(cx - 10, cy + Math.cos(angle) * mr, cz - Math.sin(angle) * mr);
    marker.rotation.x = -angle;
    group.add(marker);
  }

  // Clock hands — rotate around X axis
  // When viewed from -X: +Y is up (12), rotation.x positive goes from +Y toward -Z (clockwise)
  hourHandGroup = new THREE.Group();
  hourHandGroup.position.set(cx - 5, cy, cz);

  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(10, 220, 14), handMat);
  hourHand.position.set(0, 110, 0);
  hourHandGroup.add(hourHand);
  group.add(hourHandGroup);

  minuteHandGroup = new THREE.Group();
  minuteHandGroup.position.set(cx - 6, cy, cz);

  const minuteHand = new THREE.Mesh(new THREE.BoxGeometry(10, 310, 8), handMat);
  minuteHand.position.set(0, 155, 0);
  minuteHandGroup.add(minuteHand);
  group.add(minuteHandGroup);

  // Center cap
  const centerCap = new THREE.Mesh(new THREE.SphereGeometry(14, 10, 8), rimMat);
  centerCap.position.set(cx - 14, cy, cz);
  group.add(centerCap);

  scene.add(group);
}

function createDustParticles() {
  const count = 90;
  particlePositions = new Float32Array(count * 3);
  particleSeeds = new Float32Array(count);
  const rng = Math.random;

  for (let i = 0; i < count; i++) {
    particlePositions[i * 3] = (rng() - 0.5) * 5500 + ROOM_CX;
    particlePositions[i * 3 + 1] = FLOOR_Y + rng() * (CEILING_Y - FLOOR_Y);
    particlePositions[i * 3 + 2] = (rng() - 0.5) * 4000 + ROOM_CZ;
    particleSeeds[i] = rng() * Math.PI * 2;
  }

  particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));

  const particleMat = new THREE.PointsMaterial({
    size: 9,
    color: 0xffeecc,
    transparent: true,
    opacity: 0.45,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const particles = new THREE.Points(particleGeometry, particleMat);
  scene.add(particles);
}

function createDeskLamp() {
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.5 });

  // All positions in world space — lamp sits left of the computer on the desk
  const baseX = DESK_CX - 1200;
  const baseY = DESK_Y;
  const baseZ = DESK_CZ - 500;

  // Where we want the shade to aim: the computer / keyboard area
  const targetX = DESK_CX;
  const targetY = DESK_Y - 50;
  const targetZ = DESK_CZ;

  // --- Base ---
  const base = new THREE.Mesh(new THREE.CylinderGeometry(110, 120, 30, 24), lampMat);
  base.position.set(baseX, baseY, baseZ);
  base.castShadow = true;
  scene.add(base);

  // --- Arm keypoints (world space) ---
  // Lower arm: 15° back from vertical; upper arm: 55° from lower arm → -40° from vertical
  const arm1Len = 500;
  const arm2Len = 562;
  const arm1Angle = THREE.MathUtils.degToRad(15); // 15° back from vertical
  const arm2Angle = THREE.MathUtils.degToRad(15 - 55); // 55° clockwise from arm1 = -40° from vertical

  const j0 = new THREE.Vector3(baseX, baseY + 15, baseZ);
  // Elbow: arm1 goes up and slightly back (-Z)
  const j1 = new THREE.Vector3(
    baseX,
    baseY + 15 + Math.cos(arm1Angle) * arm1Len,
    baseZ - Math.sin(arm1Angle) * arm1Len,
  );
  // Head: arm2 swings forward (+Z) and down from elbow
  const headPos = new THREE.Vector3(
    baseX,
    j1.y + Math.cos(arm2Angle) * arm2Len,
    j1.z - Math.sin(arm2Angle) * arm2Len,
  );

  // Helper: cylinder between two points
  function armBetween(a, b, radius) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 10), lampMat);
    arm.position.copy(mid);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    arm.castShadow = true;
    scene.add(arm);
  }

  // Joint spheres
  const joint1 = new THREE.Mesh(new THREE.SphereGeometry(18, 12, 8), lampMat);
  joint1.position.copy(j0);
  joint1.castShadow = true;
  scene.add(joint1);

  const joint2 = new THREE.Mesh(new THREE.SphereGeometry(16, 12, 8), lampMat);
  joint2.position.copy(j1);
  joint2.castShadow = true;
  scene.add(joint2);

  // Arms
  armBetween(j0, j1, 12);
  armBetween(j1, headPos, 10);

  // --- Shade — build in a group, then orient toward target ---
  const shadeGroup = new THREE.Group();
  shadeGroup.position.copy(headPos);
  scene.add(shadeGroup);

  // Point the shade's -Y axis toward the target:
  // Build a rotation that maps (0,-1,0) to the direction from head to target
  const aimDir = new THREE.Vector3().subVectors(
    new THREE.Vector3(targetX, targetY, targetZ),
    headPos,
  ).normalize();
  shadeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), aimDir);
  // Tilt shade 25° further toward computer/chair (+Z)
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(-25));
  shadeGroup.quaternion.multiply(tilt);

  // Shade outer (conical, narrow top / wide bottom, along local -Y)
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0, 130, 200, 24, 1, true), lampMat);
  shade.position.set(0, -60, 0);
  shade.castShadow = true;
  shadeGroup.add(shade);

  // Shade inner glow
  const shadeInMat = new THREE.MeshStandardMaterial({
    color: 0xffe08a,
    roughness: 0.9,
    side: THREE.BackSide,
    emissive: 0xffe08a,
    emissiveIntensity: 1.5,
  });
  const shadeIn = new THREE.Mesh(new THREE.CylinderGeometry(0, 130, 200, 24, 1, true), shadeInMat);
  shadeIn.position.set(0, -60, 0);
  shadeGroup.add(shadeIn);

  // Shade bottom cap ring
  const shadeRim = new THREE.Mesh(new THREE.TorusGeometry(130, 4, 8, 24), lampMat);
  shadeRim.rotation.x = Math.PI / 2;
  shadeRim.position.set(0, -160, 0);
  shadeGroup.add(shadeRim);

  // Bulb
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(24, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffcc44, emissiveIntensity: 3.0 }),
  );
  bulb.position.set(0, -100, 0);
  shadeGroup.add(bulb);

  // --- Lights ---
  shadeGroup.updateWorldMatrix(true, true);
  const bulbWorld = new THREE.Vector3();
  bulb.getWorldPosition(bulbWorld);

  const spotLight = new THREE.SpotLight(0xffcc66, 500000, 0, Math.PI / 4, 0.5, 2);
  spotLight.position.copy(bulbWorld);
  spotLight.target.position.set(targetX, targetY, targetZ);
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.set(1024, 1024);
  scene.add(spotLight);
  scene.add(spotLight.target);

  const fillLight = new THREE.PointLight(0xffcc66, 100000, 0, 2);
  fillLight.position.copy(bulbWorld);
  scene.add(fillLight);

}

function createOfficeChair() {
  const chairGroup = new THREE.Group();

  const blackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.1 });
  const meshMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.1, metalness: 0.9 });

  // Build chair from bottom up so all parts connect
  // Casters sit on the floor (Y=0 in local space), everything chains upward
  const casterR = 30;
  const casterH = 35;
  const baseArmH = 22;
  const baseY = casterR; // center of base arms sits on top of casters
  const gasCylH = 340;
  const gasCylBottomY = baseY + baseArmH / 2; // gas cylinder starts at top of base
  const gasCylTopY = gasCylBottomY + gasCylH;
  const panH = 30;
  const panY = gasCylTopY + panH / 2; // pan sits on top of gas cylinder
  const seatH = 80;
  const seatY = panY + panH / 2 + seatH / 2; // seat sits on top of pan

  // Seat cushion
  const seat = new THREE.Mesh(new RoundedBoxGeometry(560, seatH, 520, 6, 30), blackMat);
  seat.position.set(0, seatY, 0);
  seat.castShadow = true;
  seat.receiveShadow = true;
  chairGroup.add(seat);

  // Seat pan
  const pan = new THREE.Mesh(new THREE.BoxGeometry(560, panH, 520), blackMat);
  pan.position.set(0, panY, 0);
  chairGroup.add(pan);

  // Backrest frame — positioned so bottom edge meets seat back
  const backH = 620;
  const backGroup = new THREE.Group();
  backGroup.position.set(0, seatY + seatH / 2 + backH / 2, -250);
  backGroup.rotation.x = THREE.MathUtils.degToRad(-5);
  chairGroup.add(backGroup);

  const backCushion = new THREE.Mesh(new RoundedBoxGeometry(520, backH, 60, 6, 25), meshMat);
  backCushion.castShadow = true;
  backGroup.add(backCushion);

  const lumbar = new THREE.Mesh(new RoundedBoxGeometry(440, 140, 40, 4, 18), blackMat);
  lumbar.position.set(0, -120, 38);
  backGroup.add(lumbar);

  // Headrest — attached above backrest via stem
  const headrestY = seatY + seatH / 2 + backH + 80;
  const headStem = new THREE.Mesh(new THREE.BoxGeometry(20, 100, 20), blackMat);
  headStem.position.set(0, headrestY - 50, -258);
  chairGroup.add(headStem);

  const headrest = new THREE.Mesh(new RoundedBoxGeometry(300, 160, 60, 4, 20), blackMat);
  headrest.position.set(0, headrestY + 30, -260);
  headrest.rotation.x = THREE.MathUtils.degToRad(-5);
  headrest.castShadow = true;
  chairGroup.add(headrest);

  // Armrests — posts angle inward at the bottom to connect to seat edge
  const seatW = 560;
  const armPadX = 320; // X position of arm pad (outside seat)
  const armSeatX = seatW / 2; // X position where post meets seat edge
  for (const side of [-1, 1]) {
    const armPostH = 180;
    const armPad = new THREE.Mesh(new RoundedBoxGeometry(60, 22, 200, 4, 10), blackMat);
    armPad.position.set(side * armPadX, seatY + armPostH + 11, 0);
    armPad.castShadow = true;
    chairGroup.add(armPad);
    // Angled post: top at armPadX, bottom at seat edge (armSeatX)
    const dx = armPadX - armSeatX;
    const postLen = Math.sqrt(armPostH * armPostH + dx * dx);
    const postAngle = Math.atan2(dx, armPostH);
    const armPost = new THREE.Mesh(new THREE.BoxGeometry(28, postLen, 28), blackMat);
    armPost.position.set(side * (armSeatX + dx / 2), seatY + armPostH / 2, 0);
    armPost.rotation.z = side * -postAngle;
    chairGroup.add(armPost);
  }

  // Gas cylinder — connects base to seat pan
  const gasCyl = new THREE.Mesh(new THREE.CylinderGeometry(28, 22, gasCylH, 16), chromeMat);
  gasCyl.position.set(0, gasCylBottomY + gasCylH / 2, 0);
  gasCyl.castShadow = true;
  chairGroup.add(gasCyl);

  // 5-star base — spokes radiate from center to casters
  const spokeLen = 360;
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(spokeLen, baseArmH, 35), chromeMat);
    arm.position.set(Math.sin(angle) * spokeLen / 2, baseY, Math.cos(angle) * spokeLen / 2);
    arm.rotation.y = angle + Math.PI / 2;
    arm.castShadow = true;
    arm.receiveShadow = true;
    chairGroup.add(arm);

    const caster = new THREE.Mesh(new THREE.CylinderGeometry(casterR, casterR, casterH, 16), blackMat);
    caster.rotation.z = Math.PI / 2;
    caster.position.set(Math.sin(angle) * spokeLen, casterR, Math.cos(angle) * spokeLen);
    caster.castShadow = true;
    caster.receiveShadow = true;
    chairGroup.add(caster);
  }

  // Back support struts — connect seat pan to backrest
  const strutH = 340;
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(22, strutH, 22), blackMat);
    strut.position.set(side * 220, seatY + strutH / 2 - 40, -200);
    strut.rotation.x = THREE.MathUtils.degToRad(-12);
    strut.castShadow = true;
    chairGroup.add(strut);
  }

  // Scale up, rotate to face desk, position in front of desk
  chairGroup.scale.set(1.75, 1.75, 1.75);
  chairGroup.rotation.y = Math.PI * 0.8;
  chairGroup.position.set(DESK_CX - 300, FLOOR_Y, DESK_CZ + 1600);
  scene.add(chairGroup);
}

async function init() {
  clock = new THREE.Clock(true);

  rendererCSS3D = new CSS3DRenderer();
  rendererCSS3D.domElement.style.position = "absolute";
  rendererCSS3D.domElement.style.top = "0";
  rendererCSS3D.domElement.style.zIndex = "1";
  rendererCSS3D.domElement.style.pointerEvents = "none";
  rendererCSS3D.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(rendererCSS3D.domElement);

  rendererWebGL = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
  rendererWebGL.colorSpace = THREE.SRGBColorSpace;
  rendererWebGL.domElement.style.position = "absolute";
  rendererWebGL.domElement.style.top = "0";
  rendererWebGL.domElement.style.zIndex = "2";
  rendererWebGL.domElement.style.pointerEvents = "none";
  rendererWebGL.shadowMap.enabled = true;
  rendererWebGL.shadowMap.type = THREE.PCFSoftShadowMap;
  rendererWebGL.toneMapping = THREE.NeutralToneMapping;
  rendererWebGL.toneMappingExposure = 1.4;
  rendererWebGL.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  rendererWebGL.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(rendererWebGL.domElement);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 100000);

  RectAreaLightUniformsLib.init();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  // Lighting — restrained global fill so the room is not completely black
  {
    const dirLight = new THREE.DirectionalLight(0xffd580, 0.15);
    dirLight.position.set(-200 + WORLD_SHIFT_X, 800, 800 + WORLD_SHIFT_Z);
    dirLight.target.position.set(WORLD_SHIFT_X, 0, WORLD_SHIFT_Z);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 10000;
    dirLight.shadow.camera.left = -5000;
    dirLight.shadow.camera.right = 5000;
    dirLight.shadow.camera.top = 5000;
    dirLight.shadow.camera.bottom = -5000;
    dirLight.shadow.radius = 64;
    scene.add(dirLight);
    scene.add(dirLight.target);
  }

  // ── Monitor & screen ──────────────────────────────────────────────────────
  {
    const screenSize = new THREE.Vector2(852, 588);

    await loadGltf("models/monitor.glb").then((monitor) => {
      monitor.scale.set(0.0825, 0.075, 0.075);
      monitor.position.set(DESK_CX + 100, DESK_Y, DESK_CZ - 334 + 150);
      applyAtariMaterial(monitor);
      monitor.traverse((child) => {
        if (child.isMesh) child.castShadow = true;
      });
      scene.add(monitor);
    });

    iframe = document.createElement("iframe");
    iframe.style.width = `${screenSize.width}px`;
    iframe.style.height = `${screenSize.height}px`;
    iframe.style.border = "0px";
    iframe.style.backfaceVisibility = "hidden";
    iframe.src = "./hatari/";
    const screen = new CSS3DObject(iframe);
    screen.position.set(SCREEN_X, SCREEN_Y, SCREEN_Z);
    screen.rotation.x = THREE.MathUtils.degToRad(-10);
    scene.add(screen);

    const geometry = new THREE.PlaneGeometry(screenSize.width, screenSize.height);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      blending: THREE.NoBlending,
      opacity: 0,
      premultipliedAlpha: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(SCREEN_X, SCREEN_Y, SCREEN_Z);
    mesh.rotation.x = THREE.MathUtils.degToRad(-10);
    scene.add(mesh);

    // Power button — glowing disc on the monitor bezel (bottom-right)
    const monitorX = DESK_CX + 100;
    const monitorY = DESK_Y;
    const monitorZ = DESK_CZ - 334 + 150;
    const powerButtonMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(45.5, 42),
      new THREE.MeshStandardMaterial({
        // color: 0x29abe2,
        // emissive: 0x29abe2,
        color: 0x99ff99,
        emissive: 0x99ff99,
        emissiveIntensity: 0.8,
        roughness: 0.4,
        metalness: 0.1,
        transparent: true,
        opacity: 0.0,
      }),
    );
    // Front face of bezel, bottom-right — Z pushes it just proud of the bezel surface
    powerButtonMesh.position.set(monitorX + 279, monitorY + 217.5, monitorZ + 402);
    powerButtonMesh.rotation.x = THREE.MathUtils.degToRad(-10); // match screen tilt
    powerButtonMesh.name = "powerButton";
    scene.add(powerButtonMesh);

    loadTexture("textures/fullscreen.png").then((iconTex) => {
      const iconMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(45.5 * 0.75, 42 * 0.75),
        new THREE.MeshBasicMaterial({ map: iconTex, transparent: true, depthWrite: false, opacity: 0.333 }),
      );
      iconMesh.position.z = 1; // just proud of the button face
      powerButtonMesh.add(iconMesh);
    });

    // Monitor glow — soft blue-white rect light matching screen face
    const screenLight = new THREE.RectAreaLight(0xc8d8ff, 3.5, screenSize.width, screenSize.height);
    screenLight.position.set(SCREEN_X, SCREEN_Y, SCREEN_Z + 20);
    screenLight.rotation.x = THREE.MathUtils.degToRad(-10);
    // RectAreaLight emits in -Z local space; rotate 180° on Y to point toward +Z (toward the chair)
    screenLight.rotation.y = Math.PI;
    scene.add(screenLight);

  }

  // ── Atari ST ──────────────────────────────────────────────────────────────
  await loadGltf("models/atari-st.glb").then((atariSt) => {
    atariSt.rotation.set(0, THREE.MathUtils.degToRad(5), 0);
    atariSt.scale.set(7, 7, 7);
    atariSt.position.set(DESK_CX - 850, DESK_Y - 6, DESK_CZ + 750);
    atariSt.traverse((child) => {
      if (child.isMesh) {
        child.geometry.deleteAttribute("color");
        child.geometry.computeVertexNormals();
      }
    });
    applyAtariMaterial(atariSt);
    enableShadows(atariSt);
    scene.add(atariSt);

    return loadTexture("textures/badge.webp").then((badgeTexture) => {
      const badgeGeometry = new THREE.PlaneGeometry(37, 4);
      const badgeMaterial = new THREE.MeshStandardMaterial({ map: badgeTexture, transparent: true, roughness: 0.6, metalness: 0 });
      const badgeMesh = new THREE.Mesh(badgeGeometry, badgeMaterial);
      badgeMesh.position.set(138.6, 21.5, 2.5);
      badgeMesh.rotation.x = -Math.PI / 2.35;
      atariSt.add(badgeMesh);
    });
  });

  // ── Mouse ─────────────────────────────────────────────────────────────────
  await loadGltf("models/mouse.glb").then((mouse) => {
    mouse.rotation.set(-Math.PI / 2, 0, THREE.MathUtils.degToRad(-15));
    mouse.scale.set(3, 3, 3);
    mouse.position.set(DESK_CX + 800, DESK_Y, DESK_CZ + 700);
    applyAtariMaterial(mouse);
    enableShadows(mouse);
    scene.add(mouse);
  });

  // ── Plant (on the desk, back-right corner) ─────────────────────────────────
  await loadGltf("models/plant.glb").then((plant) => {
    plant.scale.set(82, 82, 82);
    plant.position.set(DESK_CX + 1000, DESK_Y, DESK_CZ - 600);
    enableShadows(plant);
    scene.add(plant);
  });

  // ── Glass desk ────────────────────────────────────────────────────────────
  {
    const desktopGeometry = new RoundedBoxGeometry(3125, 10, 2000, 16, 100);
    const desktopMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.15,
      metalness: 0.0,
      transmission: 0.15,
      thickness: 40,
      opacity: 0.98,
      transparent: true,
      clearcoat: 1.0,
      clearcoatRoughness: 0.01,
      ior: 1.6,
      attenuationColor: 0xffffff,
      attenuationDistance: 0.2,
    });
    const desktop = new THREE.Mesh(desktopGeometry, desktopMaterial);
    desktop.position.set(DESK_CX, DESK_Y, DESK_CZ + 150);
    desktop.castShadow = true;
    desktop.receiveShadow = true;

    const mesmoTexture = await loadTexture("textures/mesmotronic.webp");

    const watermarkGeometry = new THREE.PlaneGeometry(2048, 1024);
    const watermarkMaterial = new THREE.MeshBasicMaterial({
      map: mesmoTexture,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const watermark = new THREE.Mesh(watermarkGeometry, watermarkMaterial);
    watermark.position.set(0, 5.5, 0);
    watermark.rotation.x = -Math.PI / 2;
    desktop.add(watermark);
    scene.add(desktop);

    const legRadius = 30;
    const legHeight = 1500;
    const legGeometry = new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 32);
    const dx = 3125 / 2 - legRadius * 1.5 - 100;
    const dz = 2000 / 2 - legRadius * 1.5 - 100;
    const y = desktop.position.y - legHeight / 2 - 5;
    const legPositions = [
      [desktop.position.x - dx, y, desktop.position.z - dz],
      [desktop.position.x + dx, y, desktop.position.z - dz],
      [desktop.position.x - dx, y, desktop.position.z + dz],
      [desktop.position.x + dx, y, desktop.position.z + dz],
    ];

    const envMap = await loadTexture("./textures/2294472375_24a3b8ef46_o.webp");
    envMap.mapping = THREE.EquirectangularReflectionMapping;
    envMap.colorSpace = THREE.SRGBColorSpace;
    const legMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf0f0f0,
      metalness: 1.0,
      roughness: 0.02,
      envMap,
      envMapIntensity: 1.5,
      reflectivity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.01,
      transmission: 0.0,
    });
    for (const position of legPositions) {
      const leg = new THREE.Mesh(legGeometry, legMaterial);
      leg.position.set(...position);
      leg.castShadow = true;
      leg.receiveShadow = true;
      scene.add(leg);
    }

    // ── Room shell (built after we know floor Y from desk legs) ──────────────
    createRoom();
    createRug();
    createWindow();
    createBookshelf();
    await createPoster();
    createSofa();
    createSideTable();
    createFilingCabinet();
    createPendantLight();
    createDeskLamp();
    createWallClock();
    createOfficeChair();
    createDustParticles();
  }

  // ── CameraControls ───────────────────────────────────────────────────────
  {
    CameraControls.install({ THREE });

    const controlsDiv = document.createElement("div");
    controlsDiv.style.position = "absolute";
    controlsDiv.style.top = "0";
    controlsDiv.style.left = "0";
    controlsDiv.style.width = "100%";
    controlsDiv.style.height = "100%";
    controlsDiv.style.zIndex = "0";
    controlsDiv.style.cursor = "grab";
    document.body.appendChild(controlsDiv);

    controls = new CameraControls(camera, controlsDiv);
    controls.smoothTime = 1.0;
    controls.draggingSmoothTime = 0.15;
    controls.enabled = false;

    controlsDiv.addEventListener("pointerdown", () => {
      controlsDiv.style.cursor = "grabbing";
      iframe.style.pointerEvents = "none";
    });
    controlsDiv.addEventListener("pointerup", () => {
      controlsDiv.style.cursor = "grab";
      iframe.style.pointerEvents = "auto";
    });

    // Power button click — raycaster against the glow disc
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    controlsDiv.addEventListener("click", (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(scene.getObjectByName("powerButton"));
      if (hits.length > 0) {
        iframe.requestFullscreen?.() ?? iframe.webkitRequestFullscreen?.();
      }
    });
  }

  window.addEventListener("resize", resizeHandler);
  resizeHandler();

  rendererWebGL.setAnimationLoop(animate);

  // Intro camera fly-in
  controls.setLookAt(
    DESK_CX + 8000, 3000, DESK_CZ + 15000,
    DESK_CX, -200, DESK_CZ,
    false,
  );

  setTimeout(() => {
    controls.setLookAt(
      DESK_CX + 1500, 700, DESK_CZ + 5500,
      DESK_CX, -200, DESK_CZ,
      true,
    );

    setTimeout(() => {
      controls.enabled = true;
    }, controls.smoothTime * 1000);
  }, 1000);
}

init();
