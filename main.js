import * as THREE from "three/webgpu";

import { gsap } from "gsap";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CSS3DObject, CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";
import Stats from "three/addons/libs/stats.module.js";

let camera, scene, rendererCSS3D, rendererWebGPU;
let stats;
let controls;
let iframe;

/**
 * Atari ST-like RAL 7038 coloured matt plastic material
 */
const atariMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xAFB0A8,
  roughness: 0.6,
  metalness: 0.1,
  clearcoat: 0.5,
  clearcoatRoughness: 0.4,
});

const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
gltfLoader.setDRACOLoader(dracoLoader);

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, gltf => resolve(gltf.scene), undefined, reject);
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

  rendererWebGPU.setSize(window.innerWidth, window.innerHeight);
  rendererCSS3D.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  stats.begin();
  controls.update();
  rendererWebGPU.render(scene, camera);
  rendererCSS3D.render(scene, camera);
  stats.end();
}

function applyAtariMaterial(parent) {
  parent.traverse((child) => {
    if (child.isMesh) {
      child.material = atariMaterial;
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

async function init() {
  // Add Stats
  stats = new Stats();
  stats.dom.style.position = "absolute";
  stats.dom.style.top = "0";
  stats.dom.style.left = "0";
  stats.dom.style.zIndex = "10";
  document.body.appendChild(stats.dom);

  rendererCSS3D = new CSS3DRenderer();
  rendererCSS3D.domElement.style.position = "absolute";
  rendererCSS3D.domElement.style.top = "0";
  rendererCSS3D.domElement.style.zIndex = "1";
  rendererCSS3D.domElement.style.pointerEvents = "none";
  rendererCSS3D.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(rendererCSS3D.domElement);

  rendererWebGPU = new THREE.WebGPURenderer({ antialias: false, alpha: true, logarithmicDepthBuffer: true });
  rendererWebGPU.colorSpace = THREE.SRGBColorSpace;
  rendererWebGPU.domElement.style.position = "absolute";
  rendererWebGPU.domElement.style.top = "0";
  rendererWebGPU.domElement.style.zIndex = "2";
  rendererWebGPU.domElement.style.pointerEvents = "none";
  rendererWebGPU.shadowMap.enabled = true;
  rendererWebGPU.shadowMap.type = THREE.PCFSoftShadowMap;
  rendererWebGPU.toneMapping = THREE.NeutralToneMapping;
  rendererWebGPU.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  rendererWebGPU.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(rendererWebGPU.domElement);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 100000);
  camera.position.set(-500, 300, 2000);
  camera.lookAt(0, 0, 0);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);
  scene.fog = new THREE.Fog(0x111111, 90000, 100000);

  // Add lighting
  {
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2.5);
    hemisphereLight.position.set(-200, 100, 350);
    scene.add(hemisphereLight);

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
  }

  // Add monitor and screen
  {
    const screenSize = new THREE.Vector2(852, 588);

    // Add monitor
    await loadGltf('models/monitor.glb').then((monitor) => {
      monitor.scale.set(0.0825, 0.075, 0.075);
      monitor.position.set(0, -550, -334);
      applyAtariMaterial(monitor);
      monitor.traverse((child) => {
        if (child.isMesh) child.castShadow = true;
      });
      scene.add(monitor);
    });

    // Add screen content (Hatari) using CSS3D
    iframe = document.createElement("iframe");
    iframe.style.width = `${screenSize.width}px`;
    iframe.style.height = `${screenSize.height}px`;
    iframe.style.border = "0px";
    iframe.style.backfaceVisibility = "hidden";
    iframe.src = "./hatari/";
    const screen = new CSS3DObject(iframe);
    screen.rotation.x = THREE.MathUtils.degToRad(-10);
    scene.add(screen);

    // Cut a hole in WebGL so we can see the screen through it
    const geometry = new THREE.PlaneGeometry(screenSize.width, screenSize.height);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      blending: THREE.NoBlending,
      opacity: 0,
      premultipliedAlpha: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = THREE.MathUtils.degToRad(-10);
    scene.add(mesh);
  }

  // Add Atari ST
  await loadGltf('models/atari-st.glb').then((atariSt) => {
    atariSt.rotation.set(0, THREE.MathUtils.degToRad(5), 0);
    atariSt.scale.set(7, 7, 7);
    atariSt.position.set(-900, -556, 700);
    applyAtariMaterial(atariSt);
    enableShadows(atariSt);
    scene.add(atariSt);

    return loadTexture('textures/badge.webp').then((badgeTexture) => {
      const badgeGeometry = new THREE.PlaneGeometry(37, 4);
      const badgeMaterial = new THREE.MeshBasicMaterial({ map: badgeTexture, transparent: true });
      const badgeMesh = new THREE.Mesh(badgeGeometry, badgeMaterial);
      badgeMesh.position.set(138.6, 21.5, 2.5);
      badgeMesh.rotation.x = -Math.PI / 2.35;
      atariSt.add(badgeMesh);
    });
  });

  // Add mouse (STM1)
  await loadGltf('models/mouse.glb').then((mouse) => {
    mouse.rotation.set(-Math.PI / 2, 0, THREE.MathUtils.degToRad(-15));
    mouse.scale.set(3, 3, 3);
    mouse.position.set(500, -550, 750);
    applyAtariMaterial(mouse);
    enableShadows(mouse);
    scene.add(mouse);
  });

  // Add a plant to brighten things up a bit
  await loadGltf('models/plant.glb').then((plant) => {
    plant.scale.set(85, 85, 85);
    plant.position.set(-1200, -550, -500);
    enableShadows(plant);
    scene.add(plant);
  });

  // Add a glass desk with chrome legs
  {
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
    await loadTexture('textures/mesmotronic.webp').then((watermarkTexture) => {
      const watermarkGeometry = new THREE.PlaneGeometry(2048, 1024);
      const watermarkMaterial = new THREE.MeshBasicMaterial({ map: watermarkTexture, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
      const watermark = new THREE.Mesh(watermarkGeometry, watermarkMaterial);
      watermark.position.set(0, 5.5, 0);
      watermark.rotation.x = -Math.PI / 2;
      desktop.add(watermark);
    });
    scene.add(desktop);

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
    await loadTexture('./textures/2294472375_24a3b8ef46_o.webp').then((envMap) => {
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
      for (const position of legPositions) {
        const leg = new THREE.Mesh(legGeometry, legMaterial);
        leg.position.set(...position);
        leg.castShadow = true;
        leg.receiveShadow = true;
        scene.add(leg);
      }
    });

    // Add floor
    const floorGeometry = new THREE.PlaneGeometry(7500, 7500);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      side: THREE.FrontSide,
    });
    const floorPlane = new THREE.Mesh(floorGeometry, floorMaterial);
    floorPlane.rotation.x = THREE.MathUtils.degToRad(-90);
    floorPlane.position.set(0, desktop.position.y - legHeight, 0);
    floorPlane.receiveShadow = true;
    scene.add(floorPlane);
  }

  // Add controls connected to a div behind CSS3DRenderer so it doesn't block touch interactions
  {
    const controlsDiv = document.createElement("div");
    controlsDiv.style.position = "absolute";
    controlsDiv.style.top = "0";
    controlsDiv.style.left = "0";
    controlsDiv.style.width = "100%";
    controlsDiv.style.height = "100%";
    controlsDiv.style.zIndex = "0";
    controlsDiv.style.cursor = "grab";
    document.body.appendChild(controlsDiv);

    controls = new OrbitControls(camera);
    controls.enableDamping = true;
    controls.enabled = false;
    controls.connect(controlsDiv);
    controls.addEventListener("start", () => {
      controlsDiv.style.cursor = "grabbing";
      iframe.style.pointerEvents = "none";
    });
    controls.addEventListener("end", () => {
      controlsDiv.style.cursor = "grab";
      iframe.style.pointerEvents = "auto";
    });
  }

  window.addEventListener("resize", resizeHandler);
  resizeHandler();

  rendererWebGPU.setAnimationLoop(animate);

  // Let's go!
  gsap.from(camera.position, {
    x: -20000,
    y: 7500,
    z: 10000,
    delay: 1.0,
    duration: 5.0,
    ease: "power2.out",
    onComplete: () => controls.enabled = true,
  });
}

init();