import * as THREE from "three";

import { gsap } from "gsap";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CSS3DObject, CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";

let camera, scene, rendererCSS3D, rendererWebGL;
let controls;

/**
 * Atari ST-like RAL 7038 coloured material
 */
const atariMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xAFB0A8,
  roughness: 0.6,
  metalness: 0.1,
  clearcoat: 0.5,
  clearcoatRoughness: 0.4,
});

init();

function init() {
  const screenSize = new THREE.Vector2(852, 588);

  rendererCSS3D = new CSS3DRenderer();
  rendererCSS3D.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(rendererCSS3D.domElement);

  rendererWebGL = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
  rendererWebGL.domElement.style.position = "absolute";
  rendererWebGL.domElement.style.top = "0";
  rendererWebGL.toneMapping = THREE.NeutralToneMapping;
  rendererWebGL.colorSpace = THREE.SRGBColorSpace;
  rendererWebGL.shadowMap.enabled = true;
  rendererWebGL.shadowMap.type = THREE.PCFSoftShadowMap;
  rendererWebGL.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  rendererWebGL.setSize(window.innerWidth, window.innerHeight);
  rendererWebGL.setAnimationLoop(animate);
  document.body.appendChild(rendererWebGL.domElement);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 100_000);
  camera.position.set(-500, 300, 1800);
  camera.lookAt(0, 0, 0);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);
  scene.fog = new THREE.Fog(0x111111, 90000, 100000);

  // Add ambient lighting
  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2.5);
  hemisphereLight.position.set(-200, 100, 350);
  scene.add(hemisphereLight);

  // Add a shadow-casting directional light
  const dirLight = new THREE.DirectionalLight(0xffffee, 1);
  dirLight.position.set(-200, 800, 800);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 10;
  dirLight.shadow.camera.far = 10000;
  dirLight.shadow.camera.left = -4000;
  dirLight.shadow.camera.right = 4000;
  dirLight.shadow.camera.top = 4000;
  dirLight.shadow.camera.bottom = -4000;
  dirLight.shadow.radius = 64;
  scene.add(dirLight);

  // Add cutout mesh
  const geometry = new THREE.PlaneGeometry(screenSize.width, screenSize.height);
  const material = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    blending: THREE.NoBlending,
    opacity: 0,
    premultipliedAlpha: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = THREE.MathUtils.degToRad(-10);
  mesh.name = "cutout";
  scene.add(mesh);

  // Add Hatari using CSS3D
  const iframe = document.createElement("iframe");
  iframe.style.width = `${screenSize.width}px`;
  iframe.style.height = `${screenSize.height}px`;
  iframe.style.border = "0px";
  iframe.src = "./hatari/";
  const screen = new CSS3DObject(iframe);
  screen.rotation.x = THREE.MathUtils.degToRad(-10);
  scene.add(screen);

  const gltfLoader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
  gltfLoader.setDRACOLoader(dracoLoader);

  gltfLoader.load('models/monitor.glb', (gltf) => {
    const model = gltf.scene;
    model.scale.set(0.075, 0.075, 0.075);
    model.position.set(0, -550, -334);
    applyAtariMaterial(model);
    model.traverse((child) => {
      if (child.isMesh) child.castShadow = true;
    });
    scene.add(model);
  });

  gltfLoader.load('models/atari-st.glb', (gltf) => {
    const model = gltf.scene;
    model.rotation.set(0, THREE.MathUtils.degToRad(5), 0);
    model.scale.set(7, 7, 7);
    model.position.set(-900, -556, 700);
    applyAtariMaterial(model);
    applyShadows(model);
    scene.add(model);

    new THREE.TextureLoader().load('textures/badge.webp', (badgeTexture) => {
      const badgeGeometry = new THREE.PlaneGeometry(37, 4);
      const badgeMaterial = new THREE.MeshBasicMaterial({ map: badgeTexture, transparent: true });
      const badgeMesh = new THREE.Mesh(badgeGeometry, badgeMaterial);
      badgeMesh.position.set(138.6, 21.5, 2.5);
      badgeMesh.rotation.x = -Math.PI / 2.35;
      model.add(badgeMesh);
    });
  });

  gltfLoader.load('models/mouse.glb', (gltf) => {
    const model = gltf.scene;
    model.rotation.set(-Math.PI / 2, 0, THREE.MathUtils.degToRad(-15));
    model.scale.set(3, 3, 3);
    model.position.set(500, -550, 750);
    applyAtariMaterial(model);
    applyShadows(model);
    scene.add(model);
  });

  gltfLoader.load('models/plant.glb', (gltf) => {
    const model = gltf.scene;
    model.scale.set(85, 85, 85);
    model.position.set(-1200, -550, -500);
    applyShadows(model);
    scene.add(model);
  });



  // Add glass desktop
  const desktopGeometry = new RoundedBoxGeometry(2500, 10, 2000, 16, 100); // 16 segments, 40 radius
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
  desktop.position.set(-250, -550, 150);
  desktop.castShadow = true;
  desktop.receiveShadow = true;
  scene.add(desktop);

  new THREE.TextureLoader().load('textures/mesmotronic.webp', (wmTexture) => {
    const wmWidth = 2_048;
    const wmHeight = 1_024;
    const wmGeometry = new THREE.PlaneGeometry(wmWidth, wmHeight);
    const wmMaterial = new THREE.MeshBasicMaterial({ map: wmTexture, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
    const wmMesh = new THREE.Mesh(wmGeometry, wmMaterial);
    wmMesh.position.set(0, 5.5, 0);
    wmMesh.rotation.x = -Math.PI / 2;
    desktop.add(wmMesh);
  });

  // Add chrome desk legs
  const legRadius = 30;
  const legHeight = 1500;
  const legGeometry = new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 32);
  const dx = (2500 / 2 - legRadius * 1.5) - 100;
  const dz = (2000 / 2 - legRadius * 1.5) - 100;
  const y = desktop.position.y - legHeight / 2 - 5;
  const legPositions = [
    [desktop.position.x - dx, y, desktop.position.z - dz], // back left
    [desktop.position.x + dx, y, desktop.position.z - dz], // back right
    [desktop.position.x - dx, y, desktop.position.z + dz], // front left
    [desktop.position.x + dx, y, desktop.position.z + dz], // front right
  ];
  new THREE.TextureLoader().load('./textures/2294472375_24a3b8ef46_o.webp', (envMap) => {
    envMap.mapping = THREE.EquirectangularReflectionMapping;
    envMap.colorSpace = THREE.SRGBColorSpace;
    const legMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf0f0f0,
      metalness: 1.0,
      roughness: 0.02,
      envMap: envMap,
      envMapIntensity: 1.5,
      reflectivity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.01,
      transmission: 0.0,
    });
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeometry, legMaterial);
      leg.position.set(...pos);
      leg.castShadow = true;
      leg.receiveShadow = true;
      scene.add(leg);
    }
  });

  // Add floor
  const floorGeometry = new THREE.PlaneGeometry(7_500, 7_500);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x111111,
    side: THREE.FrontSide,
  });
  const floorPlane = new THREE.Mesh(floorGeometry, floorMaterial);
  floorPlane.rotation.x = THREE.MathUtils.degToRad(-90);
  floorPlane.position.set(0, desktop.position.y - legHeight, 0);
  floorPlane.receiveShadow = true;
  scene.add(floorPlane);

  // Add controls
  let isDragging = false;
  controls = new OrbitControls(camera);
  controls.enableDamping = true;
  controls.enabled = false;
  controls.connect(rendererWebGL.domElement);
  controls.addEventListener("start", () => (isDragging = true));
  controls.addEventListener("end", () => (isDragging = false));

  // raycast to find CSS3DObject
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  document.addEventListener("pointermove", (event) => {
    const { domElement } = rendererWebGL;

    // Skip raycasting when dragging
    if (isDragging) {
      domElement.style.cursor = "grabbing";
      return;
    }

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    const intersects = raycaster.intersectObjects(scene.children, true);

    domElement.style.cursor = "grab";
    domElement.style.pointerEvents = "";

    if ("cutout" === intersects[0]?.object?.name) {
      domElement.style.pointerEvents = "none";
    }
  });

  window.addEventListener("resize", resizeHandler);
  resizeHandler();

  gsap.from(camera.position, {
    x: -20_000,
    y: 7_500,
    z: 10_000,
    duration: 5.0,
    ease: "power2.out",
    onComplete: () => controls.enabled = true,
  });
}

function resizeHandler() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  rendererWebGL.setSize(window.innerWidth, window.innerHeight);
  rendererCSS3D.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  controls.update();

  rendererWebGL.render(scene, camera);
  rendererCSS3D.render(scene, camera);
}

function applyAtariMaterial(parent) {
  parent.traverse((child) => {
    if (child.isMesh) {
      child.material = atariMaterial;
    }
  });
}

function applyShadows(parent) {
  parent.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}
