import * as THREE from "three";

export function createRoom() {
  const group = new THREE.Group();
  group.name = "room";

  const W = 8;
  const H = 3;
  const D = 8;

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a303b, roughness: 0.9, metalness: 0.05 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.86, metalness: 0.04, side: THREE.BackSide });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x1d222b, roughness: 0.7 });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.surface = "floor";
  group.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), accentMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  ceiling.userData.surface = "ceiling";
  group.add(ceiling);

  const walls = [
    { pos: [0, H / 2, -D / 2], rot: [0, 0, 0] },
    { pos: [0, H / 2, D / 2], rot: [0, Math.PI, 0] },
    { pos: [-W / 2, H / 2, 0], rot: [0, Math.PI / 2, 0] },
    { pos: [W / 2, H / 2, 0], rot: [0, -Math.PI / 2, 0] },
  ];
  walls.forEach((w, i) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(i < 2 ? W : D, H), wallMat);
    mesh.position.set(...w.pos);
    mesh.rotation.set(...w.rot);
    mesh.userData.surface = "wall";
    group.add(mesh);
  });

  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x4a3a3a, roughness: 1 })
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.005;
  group.add(rug);

  const table = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.45, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x6b5344, roughness: 0.6 })
  );
  table.position.set(1.6, 0.225, -1.4);
  table.userData.surface = "table";
  group.add(table);

  const grid = new THREE.GridHelper(W, 16, 0x4a5668, 0x232833);
  grid.position.y = 0.002;
  group.add(grid);

  group.userData.colliders = group.children.filter((c) => c.isMesh);
  group.userData.size = { w: W, h: H, d: D };
  return group;
}
