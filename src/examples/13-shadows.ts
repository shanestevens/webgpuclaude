import * as THREE from 'three/webgpu';
import { createScene } from './setup';

export async function createShadows(container: HTMLDivElement) {
  const { renderer, scene, camera, animate } = await createScene(container, { cameraPos: [4, 4, 6] });

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Ambient
  scene.add(new THREE.AmbientLight(0x222244, 0.4));

  // Directional light with shadows
  const dirLight = new THREE.DirectionalLight(0xffeedd, 2);
  dirLight.position.set(5, 8, 5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 30;
  dirLight.shadow.camera.left = -8;
  dirLight.shadow.camera.right = 8;
  dirLight.shadow.camera.top = 8;
  dirLight.shadow.camera.bottom = -8;
  dirLight.shadow.bias = -0.002;
  scene.add(dirLight);

  // Spot light with shadows
  const spotLight = new THREE.SpotLight(0xff4488, 30, 15, Math.PI / 6, 0.5);
  spotLight.position.set(-3, 5, 2);
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.width = 512;
  spotLight.shadow.mapSize.height = 512;
  scene.add(spotLight);

  // Light indicator
  const spotIndicator = new THREE.Mesh(
    new THREE.SphereGeometry(0.08),
    new THREE.MeshBasicNodeMaterial({ color: 0xff4488 })
  );
  spotIndicator.position.copy(spotLight.position);
  scene.add(spotIndicator);

  // Ground plane
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    new THREE.MeshStandardNodeMaterial({ color: 0x556677, roughness: 0.9 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Objects that cast and receive shadows
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 32, 32),
    new THREE.MeshStandardNodeMaterial({ color: 0x4488ff, roughness: 0.3, metalness: 0.2 })
  );
  sphere.position.set(-1.5, 0.6, 0);
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  scene.add(sphere);

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardNodeMaterial({ color: 0xff6644, roughness: 0.4 })
  );
  box.position.set(0, 0.5, 0);
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);

  const torusKnot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.4, 0.15, 100, 16),
    new THREE.MeshStandardNodeMaterial({ color: 0x44ff88, roughness: 0.2, metalness: 0.5 })
  );
  torusKnot.position.set(1.8, 0.8, 0);
  torusKnot.castShadow = true;
  torusKnot.receiveShadow = true;
  scene.add(torusKnot);

  // Tall pillar to show long shadow
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.2, 2.5, 8),
    new THREE.MeshStandardNodeMaterial({ color: 0xddcc88, roughness: 0.6 })
  );
  pillar.position.set(-0.5, 1.25, -1.5);
  pillar.castShadow = true;
  scene.add(pillar);

  animate((t) => {
    box.rotation.y = t * 0.5;
    box.rotation.x = t * 0.3;
    torusKnot.rotation.x = t * 0.4;
    torusKnot.rotation.y = t * 0.6;
    sphere.position.y = 0.6 + Math.sin(t * 1.5) * 0.4;

    // Orbit the spot light
    spotLight.position.x = Math.cos(t * 0.5) * 4;
    spotLight.position.z = Math.sin(t * 0.5) * 4;
    spotIndicator.position.copy(spotLight.position);
  });
}
