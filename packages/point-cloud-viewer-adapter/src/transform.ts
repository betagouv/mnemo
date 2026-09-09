export type PointCloudTransform = {
  position: [number, number, number];
  rotationDegrees: [number, number, number];
  scale: [number, number, number];
};

function multiply(left: Float32Array, right: Float32Array) {
  const output = new Float32Array(16);

  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) {
        value += left[index * 4 + row]! * right[column * 4 + index]!;
      }
      output[column * 4 + row] = value;
    }
  }

  return output;
}

function radians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function composePointCloudTransform({
  position: [x, y, z],
  rotationDegrees: [rotationX, rotationY, rotationZ],
  scale: [scaleX, scaleY, scaleZ],
}: PointCloudTransform) {
  const xRadians = radians(rotationX);
  const yRadians = radians(rotationY);
  const zRadians = radians(rotationZ);
  const cosX = Math.cos(xRadians);
  const sinX = Math.sin(xRadians);
  const cosY = Math.cos(yRadians);
  const sinY = Math.sin(yRadians);
  const cosZ = Math.cos(zRadians);
  const sinZ = Math.sin(zRadians);
  const translation = new Float32Array([
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    x,
    y,
    z,
    1,
  ]);
  const rotateX = new Float32Array([
    1,
    0,
    0,
    0,
    0,
    cosX,
    sinX,
    0,
    0,
    -sinX,
    cosX,
    0,
    0,
    0,
    0,
    1,
  ]);
  const rotateY = new Float32Array([
    cosY,
    0,
    -sinY,
    0,
    0,
    1,
    0,
    0,
    sinY,
    0,
    cosY,
    0,
    0,
    0,
    0,
    1,
  ]);
  const rotateZ = new Float32Array([
    cosZ,
    sinZ,
    0,
    0,
    -sinZ,
    cosZ,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
  ]);
  const scaling = new Float32Array([
    scaleX,
    0,
    0,
    0,
    0,
    scaleY,
    0,
    0,
    0,
    0,
    scaleZ,
    0,
    0,
    0,
    0,
    1,
  ]);

  return multiply(
    translation,
    multiply(rotateZ, multiply(rotateY, multiply(rotateX, scaling))),
  );
}
