// Gerak kotak (AABB) melawan collider dunia, satu sumbu demi satu sumbu.
// Dipakai pemain DAN bot, jadi tidak ada dua versi tabrakan yang bisa berpisah.
// Posisi adalah kaki (y = alas), tinggi dan radius menentukan kotak tubuh.
import * as THREE from 'three';

const RADIUS = 0.34;

export function createMover(colliders) {
  const probe = new THREE.Box3();

  function hits(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const box of colliders) {
      if (probe.intersectsBox(box)) return box;
    }
    return null;
  }

  // Geser posisi sesuai kecepatan; kembalikan apakah kaki menapak tanah.
  // Gravitasi dan lompat ditangani pemanggil lewat velocity.y.
  function move(body, dt, height) {
    const nextX = body.position.x + body.velocity.x * dt;
    if (!hits(nextX, body.position.y, body.position.z, height, 0.04)) {
      body.position.x = nextX;
    } else {
      body.velocity.x = 0;
    }
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!hits(body.position.x, body.position.y, nextZ, height, 0.04)) {
      body.position.z = nextZ;
    } else {
      body.velocity.z = 0;
    }

    body.position.y += body.velocity.y * dt;
    let grounded = false;
    const under = hits(body.position.x, body.position.y, body.position.z, height, 0);
    if (under && body.velocity.y <= 0) {
      body.position.y = under.max.y;
      body.velocity.y = 0;
      grounded = true;
    } else if (under) {
      body.position.y = under.min.y - height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      grounded = true;
    }
    return grounded;
  }

  return { move, hits };
}
