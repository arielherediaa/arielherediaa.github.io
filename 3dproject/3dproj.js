import * as THREE from 'https://unpkg.com/three@0.156.1/build/three.module.js';
import { OrbitControls } from "https://unpkg.com/three@0.156.1/examples/jsm/controls/OrbitControls.js?module";
import { createNoise2D } from 'https://unpkg.com/simplex-noise@4.0.3/dist/esm/simplex-noise.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';

let camera, scene, renderer;
let controls;
let keysPressed = {};

let velocityY = 0;
let gravity = -0.01;
let onGround = false;
const headToFeetOffset = 3.5;

let floor;

const params = {
    moveSpeed: 0.5,
    seed: '0',
    terrainType: 'Flatlands',
    regenerateTerrain: regenerateTerrain,
    followCamera: true,
    steveColors: {
        bodyColor: '#01b2b3',
        armColor: '#ae7f61',
        legColor: '#3829a9',
        fingerColor: '#ddc9a4'
    },
    orbsCollected: 0,
    customAmplitude: 3,
    customFrequency: 0.02,
    generateCustomTerrain: generateCustomTerrain,
    sunSpeed: 0.0001,
};

const orbs = [];
const orbRadius = 2;
const totalOrbs = 10;

let orbsCollectedController;

document.addEventListener('keydown', (event) => {
    keysPressed[event.key.toLowerCase()] = true;
}, false);

document.addEventListener('keyup', (event) => {
    keysPressed[event.key.toLowerCase()] = false;
}, false);

let sunMesh;
let sunAngle = 0;
const sunRadius = 1200;
const sunHeight = 400;
let directionalLight;

let baseAmbientLight;
const baseAmbientIntensity = 0.2;

init();
animate();

function init() {
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 5000);
    camera.position.set(0, 15, 25);

    scene = new THREE.Scene();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.minDistance = 10;
    controls.maxDistance = 30;

    const loader = new THREE.CubeTextureLoader();
    const skyboxTexture = loader.load([
        'assets/textures/skybox/right.png',
        'assets/textures/skybox/left.png',
        'assets/textures/skybox/top.png',
        'assets/textures/skybox/bottom.png',
        'assets/textures/skybox/front.png',
        'assets/textures/skybox/back.png'
    ]);
    scene.background = skyboxTexture;

    directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(sunRadius, sunHeight, 0);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 4096;
    directionalLight.shadow.mapSize.height = 4096;
    directionalLight.shadow.camera.left = -500;
    directionalLight.shadow.camera.right = 500;
    directionalLight.shadow.camera.top = 500;
    directionalLight.shadow.camera.bottom = -500;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 2000;
    directionalLight.shadow.bias = -0.0005;
    directionalLight.shadow.radius = 1;
    scene.add(directionalLight);

    const textureLoader = new THREE.TextureLoader();
    const sunTexture = textureLoader.load('assets/textures/skybox/sun.png');
    const sunGeometry = new THREE.SphereGeometry(50, 32, 32);
    const sunMaterial = new THREE.MeshPhongMaterial({
        map: sunTexture,
    });
    sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    sunMesh.position.set(directionalLight.position.x, directionalLight.position.y, directionalLight.position.z);
    sunMesh.castShadow = false;
    scene.add(sunMesh);

    baseAmbientLight = new THREE.AmbientLight(0xFFFFFF, baseAmbientIntensity);
    scene.add(baseAmbientLight);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    createSteve(scene);
    // Removed the creation of "pablo" cube

    floor = createTerrain(scene, params.terrainType, 0);

    const head = scene.getObjectByName("head");
    if (head) {
        camera.position.copy(head.position).add(new THREE.Vector3(0, 15, 25));
        camera.lookAt(head.position);
        controls.update();
    }

    createOrbs(scene);

    const gui = new GUI();

    const terrainFolder = gui.addFolder('Terrain Generation');
    terrainFolder.add(params, 'seed').name('Terrain Seed');
    terrainFolder.add(params, 'terrainType', ['Flatlands', 'Mountain', 'Desert', 'Tundra']).name('Terrain Type');
    terrainFolder.open();

    const cameraFolder = gui.addFolder('Camera'); // steve folder
    cameraFolder.add(params, 'followCamera').name('Follow Camera').onChange(toggleCameraMode);
    cameraFolder.open();

    const steveFolder = gui.addFolder('Steve Customization');
    steveFolder.add(params, 'moveSpeed', 0.01, 1, 0.01).name('Movement Speed');

    steveFolder.addColor(params.steveColors, 'bodyColor').name('Body Color').onChange((value) => {
        const body = scene.getObjectByName("body");
        if (body && body.material) {
            body.material.color.set(value);
        }
    }); // change color

    steveFolder.addColor(params.steveColors, 'armColor').name('Arm Color').onChange((value) => {
        const rightArm = scene.getObjectByName("rightArm");
        const leftArm = scene.getObjectByName("leftArm");
        [rightArm, leftArm].forEach(arm => {
            if (arm && arm.material) {
                arm.material.color.set(value);
            }
        });
    });

    steveFolder.addColor(params.steveColors, 'legColor').name('Leg Color').onChange((value) => {
        const leftLeg = scene.getObjectByName("leftLeg");
        const rightLeg = scene.getObjectByName("rightLeg");
        [leftLeg, rightLeg].forEach(leg => {
            if (leg && leg.material) {
                leg.material.color.set(value);
            }
        });
    });

    steveFolder.addColor(params.steveColors, 'fingerColor').name('Finger Color').onChange((value) => {
        const arms = ['rightArm', 'leftArm'];
        arms.forEach(armName => {
            const arm = scene.getObjectByName(armName);
            if (arm) {
                arm.traverse((child) => {
                    if (child.name.includes("finger") && child.material) {
                        child.material.color.set(value);
                    }
                });
            }
        });
    });

    steveFolder.open();

    const orbsFolder = gui.addFolder('Orbs (Collect 10!!)');
    orbsCollectedController = orbsFolder.add(params, 'orbsCollected').name('Orbs Collected').listen();

    const orbsInput = orbsCollectedController.domElement.querySelector('input');
    if (orbsInput) {
        orbsInput.setAttribute('disabled', true);
    }
    orbsFolder.open();

    const customTerrainFolder = gui.addFolder('Custom Terrain');
    customTerrainFolder.add(params, 'customAmplitude', 0, 100, 0.1).name('Amplitude');
    customTerrainFolder.add(params, 'customFrequency', 0.001, 1, 0.001).name('Frequency');
    customTerrainFolder.add(params, 'generateCustomTerrain').name('Generate Terrain');
    customTerrainFolder.open();

    const sunFolder = gui.addFolder('Sun');
    sunFolder.add(params, 'sunSpeed', 0.0001, 0.1, 0.0001).name('Sun Speed');
    sunFolder.open();

    gui.add(params, 'regenerateTerrain').name('Regenerate Terrain').domElement.style.order = 999;

}

function toggleCameraMode(value) {
    if (value) {
        const head = scene.getObjectByName("head");
        if (head) {
            controls.minDistance = 10;
            controls.maxDistance = 30;
            controls.target.copy(head.position);
            controls.update();
        }
    } else {
        controls.minDistance = 10;
        controls.maxDistance = 5000;
    }
}

function createTerrain(sceneGraph, type, seed, amplitude, frequency) {
    switch(type) {
        case 'Flatlands':
            return createFlatlands(sceneGraph, seed, amplitude, frequency);
        case 'Mountain':
            return createMountain(sceneGraph, seed, amplitude, frequency);
        case 'Desert':
            return createDesert(sceneGraph, seed, amplitude, frequency);
        case 'Tundra':
            return createTundra(sceneGraph, seed, amplitude, frequency);
        default:
            return createFlatlands(sceneGraph, seed, amplitude, frequency);
    }
}

function createFlatlands(sceneGraph, seed, amplitude = 3, frequency = 0.02) {

    // terrain texture
    const textureLoader = new THREE.TextureLoader();
    const flatTexture = textureLoader.load('assets/textures/floor/minecraftfloor.jpg');

    // repeat texture so it doesn't stretch
    flatTexture.wrapS = THREE.RepeatWrapping;
    flatTexture.wrapT = THREE.RepeatWrapping;
    flatTexture.repeat.set(10, 10);

    // 1000x1000
    const floorGeometry = new THREE.PlaneGeometry(1000, 1000, 100, 100);
    floorGeometry.rotateX(-Math.PI / 2); //flat

    // generate 2D noise using a seed from getrandom function
    const noise2D = createNoise2D(getRandom(seed));

    const positions = floorGeometry.attributes.position.array; // access vertex positions

    // modify for variety, looping through vertex positions
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const z = positions[i + 2];
        const noiseVal = noise2D(x * frequency, z * frequency); // generate noise value for vertex
        positions[i + 1] += noiseVal * amplitude; // adjust y coordinate of terrain based on amplitude and noise
    }

    // phong for specular lighting
    const floorMaterial = new THREE.MeshPhongMaterial({
        map: flatTexture,
        side: THREE.DoubleSide,
    });

    // name
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.receiveShadow = true;
    floorMesh.name = "flatlandsFloor";
    sceneGraph.add(floorMesh);

    return floorMesh;
}

function createMountain(sceneGraph, seed, amplitude = 200, frequency = 0.005) {

    // terrain texture
    const textureLoader = new THREE.TextureLoader();
    const mountainTexture = textureLoader.load('assets/textures/floor/mountain.jpg');

    // repeat texture so it doesn't stretch
    mountainTexture.wrapS = THREE.RepeatWrapping;
    mountainTexture.wrapT = THREE.RepeatWrapping;
    mountainTexture.repeat.set(20, 20);

    // 1000x1000
    const floorGeometry = new THREE.PlaneGeometry(1000, 1000, 200, 200);
    floorGeometry.rotateX(-Math.PI / 2); //flat

    // generate 2D noise using a seed from getrandom function
    const noise2D = createNoise2D(getRandom(seed));

    const positions = floorGeometry.attributes.position.array; // access vertex positions

    // modify for variety, looping through vertex positions
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const z = positions[i + 2];
        const noiseVal = noise2D(x * frequency, z * frequency); // generate noise value for vertex
        if (noiseVal > 0.6) {
            positions[i + 1] += ((noiseVal - 0.6) / 0.4) * amplitude; // adjust y coordinate of terrain based on amplitude and noise
        } else {
            positions[i + 1] += 5; // add minor adjustment for mountains
        }
    }

    // phong for specular lighting
    const floorMaterial = new THREE.MeshPhongMaterial({
        map: mountainTexture,
        side: THREE.DoubleSide,
    });

    // name
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.receiveShadow = true;
    sceneGraph.add(floorMesh);

    return floorMesh;
}

function createDesert(sceneGraph, seed, amplitude = 15, frequency = 0.03) {

    // terrain texture
    const textureLoader = new THREE.TextureLoader();
    const desertTexture = textureLoader.load('assets/textures/floor/sand.jpg');

    // repeat texture so it doesn't stretch
    desertTexture.wrapS = THREE.RepeatWrapping;
    desertTexture.wrapT = THREE.RepeatWrapping;
    desertTexture.repeat.set(10, 10);

    // 1000x1000
    const floorGeometry = new THREE.PlaneGeometry(1000, 1000, 200, 200);
    floorGeometry.rotateX(-Math.PI / 2); //flat

    // generate 2D noise using a seed from getrandom function
    const noise2D = createNoise2D(getRandom(seed));

    const positions = floorGeometry.attributes.position.array; // access vertex positions

    // modify for variety, looping through vertex positions
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const z = positions[i + 2];
        const noiseVal = noise2D(x * frequency, z * frequency); // generate noise value for vertex
        positions[i + 1] += noiseVal * amplitude; // adjust y coordinate of terrain based on amplitude and noise
    }

    // phong for specular lighting
    const floorMaterial = new THREE.MeshPhongMaterial({
        map: desertTexture,
        side: THREE.DoubleSide,
    });

    // name
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.receiveShadow = true;
    sceneGraph.add(floorMesh);

    return floorMesh;
}

function createTundra(sceneGraph, seed, amplitude = 200, frequency = 0.001) {

    // terrain texture
    const textureLoader = new THREE.TextureLoader();
    const tundraTexture = textureLoader.load('assets/textures/floor/tundra.jpg');

    // repeat texture so it doesn't stretch
    tundraTexture.wrapS = THREE.RepeatWrapping;
    tundraTexture.wrapT = THREE.RepeatWrapping;
    tundraTexture.repeat.set(10, 10);

    // 5000x5000
    const floorGeometry = new THREE.PlaneGeometry(5000, 5000, 200, 200);
    floorGeometry.rotateX(-Math.PI / 2); //flat

    // generate 2D noise using a seed from getrandom function
    const noise2D = createNoise2D(getRandom(seed));

    const positions = floorGeometry.attributes.position.array; // access vertex positions

    // modify for variety, looping through vertex positions
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const z = positions[i + 2];
        const noiseVal = noise2D(x * frequency, z * frequency); // generate noise value for vertex
        positions[i + 1] += noiseVal * amplitude; // adjust y coordinate of terrain based on amplitude and noise
    }

    // phong for specular lighting
    const floorMaterial = new THREE.MeshPhongMaterial({
        map: tundraTexture,
        side: THREE.DoubleSide,
    });

    // name
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.receiveShadow = true;
    sceneGraph.add(floorMesh);

    return floorMesh;
}


function createSteve(sceneGraph) {
    const textureLoader = new THREE.TextureLoader();
    const steveFront = textureLoader.load('assets/textures/cubetextures/stevehead/front.png');
    const steveLeft = textureLoader.load('assets/textures/cubetextures/stevehead/left.png');
    const steveRight = textureLoader.load('assets/textures/cubetextures/stevehead/right.png');
    const steveTop = textureLoader.load('assets/textures/cubetextures/stevehead/top.png');
    const steveBack = textureLoader.load('assets/textures/cubetextures/stevehead/back.png');

    const steveHeadMaterials = [
        new THREE.MeshPhongMaterial({ map: steveBack, color: 0xffffff }),
        new THREE.MeshPhongMaterial({ map: steveFront, color: 0xffffff }),
        new THREE.MeshPhongMaterial({ map: steveTop, color: 0xffffff }),
        new THREE.MeshPhongMaterial({ color: "brown" }),
        new THREE.MeshPhongMaterial({ map: steveRight, color: 0xffffff }),
        new THREE.MeshPhongMaterial({ map: steveLeft, color: 0xffffff })
    ];

    const boxGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const head = new THREE.Mesh(boxGeometry, steveHeadMaterials);
    head.position.set(0, 0, 0);
    head.castShadow = true;
    head.receiveShadow = false;
    head.name = "head";
    sceneGraph.add(head);

    const boxGeometry2 = new THREE.BoxGeometry(1, 1.5, 1);
    const boxMaterial2 = new THREE.MeshPhongMaterial({ color: params.steveColors.bodyColor });
    const body = new THREE.Mesh(boxGeometry2, boxMaterial2);
    body.position.set(0, -1.06, 0);
    body.name = "body";
    body.castShadow = true;
    body.receiveShadow = false;
    head.add(body);

    const rightShoulder = createPivot(0, 0.4, 0.5, "rightShoulder");
    body.add(rightShoulder);

    const cylinderGeometryRight = new THREE.CylinderGeometry(0.1, 0.1, 1, 25, 1);
    const cylinderMaterialRight = new THREE.MeshPhongMaterial({ color: params.steveColors.armColor });
    const rightArm = new THREE.Mesh(cylinderGeometryRight, cylinderMaterialRight);
    rightArm.position.set(0, -0.3, 0.5);
    rightArm.castShadow = true;
    rightArm.receiveShadow = false;
    rightArm.name = "rightArm";
    rightArm.rotation.x = (0.70 * Math.PI);
    rightShoulder.add(rightArm);

    const leftShoulder = createPivot(0, 0.4, -0.5, "leftShoulder");
    body.add(leftShoulder);

    const cylinderGeometryLeft = new THREE.CylinderGeometry(0.1, 0.1, 1, 25, 1);
    const cylinderMaterialLeft = new THREE.MeshPhongMaterial({ color: params.steveColors.armColor });
    const leftArm = new THREE.Mesh(cylinderGeometryLeft, cylinderMaterialLeft);
    leftArm.position.set(0, -0.3, -0.5);
    leftArm.castShadow = true;
    leftArm.receiveShadow = false;
    leftArm.name = "leftArm";
    leftArm.rotation.x = (-0.70 * Math.PI);
    leftShoulder.add(leftArm);

    createFingers(leftArm);
    createFingers(rightArm);

    const leftLegPivot = createPivot(0, -0.5, 0.3, "leftPivot");
    body.add(leftLegPivot);

    const rightLegPivot = createPivot(0, -0.5, -0.3, "rightPivot");
    body.add(rightLegPivot);

    const cylinderGeometryLeg = new THREE.CylinderGeometry(0.1, 0.1, 1.8, 25, 1);
    const cylinderMaterialLeg = new THREE.MeshPhongMaterial({ color: params.steveColors.legColor });

    const leftLeg = new THREE.Mesh(cylinderGeometryLeg, cylinderMaterialLeg);
    leftLeg.position.set(0, -1, 0);
    leftLeg.castShadow = true;
    leftLeg.receiveShadow = false;
    leftLeg.name = "leftLeg";
    leftLeg.rotation.x = Math.PI;
    leftLegPivot.add(leftLeg);

    const rightLeg = new THREE.Mesh(cylinderGeometryLeg, cylinderMaterialLeg);
    rightLeg.position.set(0, -1, 0);
    rightLeg.castShadow = true;
    rightLeg.receiveShadow = false;
    rightLeg.name = "rightLeg";
    rightLeg.rotation.x = Math.PI;
    rightLegPivot.add(rightLeg);
}

function createPivot(x, y, z, name) {
    const pivotGeometry = new THREE.SphereGeometry(0.2, 32, 32);
    const pivotMaterial = new THREE.MeshPhongMaterial({ color: 'rgb(150,255,150)' });
    const pivotSphere = new THREE.Mesh(pivotGeometry, pivotMaterial);
    pivotSphere.position.set(x, y, z);
    pivotSphere.name = name;
    pivotSphere.castShadow = true;
    pivotSphere.receiveShadow = false;
    return pivotSphere;
}

function createFingers(attachTo) {
    const fingerGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 25, 1);
    const fingerMaterial = new THREE.MeshPhongMaterial({ color: params.steveColors.fingerColor });

    const finger1 = new THREE.Mesh(fingerGeometry, fingerMaterial);
    finger1.position.set(0.05, 0.5, 0);
    finger1.name = "finger1";
    finger1.castShadow = true;
    finger1.receiveShadow = false;

    const finger2 = new THREE.Mesh(fingerGeometry, fingerMaterial);
    finger2.position.set(-0.05, 0.5, 0);
    finger2.name = "finger2";
    finger2.castShadow = true;
    finger2.receiveShadow = false;

    const finger3 = new THREE.Mesh(fingerGeometry, fingerMaterial);
    finger3.position.set(0, 0.5, 0.05);
    finger3.name = "finger3";
    finger3.castShadow = true;
    finger3.receiveShadow = false;

    attachTo.add(finger1);
    attachTo.add(finger2);
    attachTo.add(finger3);
}

function createCube(x, y, z, name, texture = 'assets/textures/cubetextures/dirt.webp') {
    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    const textureLoader = new THREE.TextureLoader();
    const cubeTexture = textureLoader.load(texture);
    const cubeMaterial = new THREE.MeshLambertMaterial({ map: cubeTexture });
    const Cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    Cube.name = name;
    Cube.castShadow = true;
    Cube.receiveShadow = true;
    Cube.position.set(x, y, z);
    scene.add(Cube);
}

function createOrbs(sceneGraph) {
    const orbGeometry = new THREE.SphereGeometry(orbRadius, 32, 32);
    const orbMaterial = new THREE.MeshPhongMaterial({ color: 0xFFFF00, emissive: 0xFFFF00, emissiveIntensity: 0.5 });

    for (let i = 0; i < totalOrbs; i++) {
        const orb = new THREE.Mesh(orbGeometry, orbMaterial);
        orb.name = `orb_${i}`;

        // random x and z
        const x = Math.random() * 1000 - 500;
        const z = Math.random() * 1000 - 500;
        const y = SurfaceOrbs(x, z) + orbRadius + 0.1;

        orb.position.set(x, y, z);
        orb.castShadow = true;
        orb.receiveShadow = true;
        sceneGraph.add(orb);
        orbs.push(orb);
    }
}


// terrain height at x,z
function SurfaceOrbs(x, z) {
    // new raycaster
    const raycaster = new THREE.Raycaster(
        // origin of ray
        new THREE.Vector3(x, 500, z),
        // cast ray downward
        new THREE.Vector3(0, -1, 0),
        // start ray 0 away from origin
        0,
        // how far away ray goes
        1000
    );

    // test
    const intersects = raycaster.intersectObject(floor, true);

    // check if intersects
    if (intersects.length > 0) {

        const terrainHeight = intersects[0].point.y;
        // return terrain height
        return terrainHeight;
    } else {
        // 0 for default ground
        return 0;
    }
}


// fingers animation
function animateFingers() {
    const timeElapsed = Date.now() * 0.001;
    const fingerSpeed = 3;

    const rightArm = scene.getObjectByName("rightArm");
    if (rightArm) {
        const rightFingers = rightArm.children;
        rightFingers.forEach(finger => {
            finger.position.y = 0.5 + Math.sin(timeElapsed * fingerSpeed) * 0.05;
        });
    }

    // it just goes inward and outward for both sets of fingers lol

    const leftArm = scene.getObjectByName("leftArm");
    if (leftArm) {
        const leftFingers = leftArm.children;
        leftFingers.forEach(finger => {
            finger.position.y = 0.5 + Math.sin(timeElapsed * fingerSpeed) * 0.05;
        });
    }
}


// animate
function animate(){
    requestAnimationFrame(animate);

    //for oscillation
    const elapsedTime = Date.now() * 0.001;
    const rotationSpeed = 2;
    const head = scene.getObjectByName("head");



    if (head) {
        let isMoving = false;
        let moveVector = new THREE.Vector3();

        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);

        const cameraRight = new THREE.Vector3();
        cameraRight.crossVectors(camera.up, cameraDirection).normalize();


        // copy camera direction for calculating movement relative to steve
        if (keysPressed['w']) {
            moveVector.add(cameraDirection.clone().multiplyScalar(params.moveSpeed));
            isMoving = true;
        }
        if (keysPressed['s']) {
            moveVector.add(cameraDirection.clone().multiplyScalar(-params.moveSpeed));
            isMoving = true;
        }
        if (keysPressed['d']) {
            moveVector.add(cameraRight.clone().multiplyScalar(-params.moveSpeed));
            isMoving = true;
        }
        if (keysPressed['a']) {
            moveVector.add(cameraRight.clone().multiplyScalar(params.moveSpeed));
            isMoving = true;
        }

        if (isMoving) {
            moveVector.normalize().multiplyScalar(params.moveSpeed);
        }

        head.position.add(moveVector);

        // movement relative to camera angle
        if (isMoving) {
            const angle = Math.atan2(moveVector.x, moveVector.z);
            head.rotation.y = angle + Math.PI / 2;
        }

        // jump logic
        if (keysPressed[' ']) {
            if (onGround) {
                velocityY = 0.3;
                onGround = false;
            }
        }



        // apply downward acceleration if airborne
        if (!onGround) {
            velocityY += gravity;
            head.position.y += velocityY;
        }

//   detect terrain height beneath Steve
        const raycaster = new THREE.Raycaster(
            new THREE.Vector3(head.position.x, head.position.y + 100, head.position.z), // origin of ray,
            new THREE.Vector3(0, -1, 0) //cast ray downward
        );
        const intersects = raycaster.intersectObject(floor); // intersection test between ray and terrain

        if (intersects.length > 0) {  // Check if the ray intersects with terrain
            const terrainHeight = intersects[0].point.y; // store y cordinate of intersection point
            const desiredY = terrainHeight + headToFeetOffset; // where to move back the steve

            if (head.position.y <= desiredY) {
                head.position.y = desiredY; // snap steve's to where steve will be moved back
                velocityY = 0; //reset velocity
                onGround = true; //steve is on the ground
            } else {
                onGround = false; // airborne
            }
        }

        const rightShoulder = scene.getObjectByName("rightShoulder");
        const leftShoulder = scene.getObjectByName("leftShoulder");
        const rightLegPivot = scene.getObjectByName("rightPivot");
        const leftLegPivot = scene.getObjectByName("leftPivot");

        if (isMoving) {
            const rotationAngle = Math.cos(Date.now() * 0.007) * 0.5;
            if (rightShoulder) rightShoulder.rotation.z = rotationAngle;
            if (leftShoulder) leftShoulder.rotation.z = -rotationAngle;
            if (rightLegPivot) rightLegPivot.rotation.z = rotationAngle * 0.8;
            if (leftLegPivot) leftLegPivot.rotation.z = -rotationAngle * 0.8;
        } else {
            if (rightShoulder) rightShoulder.rotation.z = 0;
            if (leftShoulder) leftShoulder.rotation.z = 0;
            if (rightLegPivot) rightLegPivot.rotation.z = 0;
            if (leftLegPivot) leftLegPivot.rotation.z = 0;
        }
    }

    if (head) {
        const stevePosition = head.position.clone();


// loop through orbs in reverse to remove while iterating
        for (let i = orbs.length - 1; i >= 0; i--) {
            const orb = orbs[i]; // curr orb
            const distance = stevePosition.distanceTo(orb.position); // distance from steve and orb
            if (distance < (orbRadius + headToFeetOffset)) { // if distance between is less than steve and orb , then collide
                scene.remove(orb);
                orbs.splice(i, 1); // delete orb and add to counter
                params.orbsCollected++;
                if (orbsCollectedController) {
                    orbsCollectedController.updateDisplay(); // update display of GUI
                }
            }
        }
    }


    // follow camera function
    if (params.followCamera) { // check if followcamera is enabled
        const head = scene.getObjectByName("head"); // query  head
        if (head) { // check if there's head
            camera.lookAt(head.position.y); // look at steve's head
            controls.target.copy(head.position); // follow steve
            controls.update(); //apply to camera controls
        }
    }

    sunAngle += params.sunSpeed;


    // rotations
    const sunX = sunRadius * Math.cos(sunAngle);
    const sunZ = sunRadius * Math.sin(sunAngle);
    const sunY = sunHeight * Math.sin(sunAngle);


    // update sun position
    sunMesh.position.set(sunX, sunY, sunZ);
    directionalLight.position.set(sunX, sunY, sunZ);

    // light intensity based on height
    if (sunY > 0) {
        directionalLight.intensity = (sunY / sunHeight) * 1.0; // brightest
    } else {
        directionalLight.intensity = 0; // night time
    }





    animateFingers();
    renderer.render(scene, camera);
}

function regenerateTerrain() {
    if (floor) { // check if there's a floor
        scene.remove(floor); // remove floor from scene
        floor.geometry.dispose(); // remove from memory
        if (Array.isArray(floor.material)) {
            floor.material.forEach(mat => mat.dispose()); // remove from memory
        } else {
            floor.material.dispose();
        }
        floor = null;
    }

    let seedInput = params.seed.trim(); // remove spaces
    let seedNumber = 0; //default seed

    if (seedInput !== '') {
        if (!isNaN(seedInput)) {
            seedNumber = parseInt(seedInput, 10);
        } else {
            seedNumber = Hashseed(seedInput);
        }
    }

    params.seed = seedNumber.toString();
    floor = createTerrain(scene, params.terrainType, seedNumber);
    repositionOrbs();
}

function generateCustomTerrain() {
    if (floor) { // check if there's a floor
        scene.remove(floor); // remove from scene
        floor.geometry.dispose();
        if (Array.isArray(floor.material)) {  // dispose materials from memory
            floor.material.forEach(mat => mat.dispose());
        } else {
            floor.material.dispose();
        }
        floor = null;
    }

    let seedInput = params.seed.trim();
    let seedNumber = 0;

    if (seedInput !== '') {
        if (!isNaN(seedInput)) {
            seedNumber = parseInt(seedInput, 10);  // convert input to int
        } else {
            seedNumber = Hashseed(seedInput); // convert string to hash
        }
    }

    params.seed = seedNumber.toString(); // new terrain seed in gui
    // new terrain
    floor = createTerrain(scene, params.terrainType, seedNumber, params.customAmplitude, params.customFrequency);
    repositionOrbs(); // reposition the orbs
}

function Hashseed(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        let charCode = str.charCodeAt(i);
        hash = hash + charCode;
    }
    if (hash < 0) {
        hash = -hash;
    }
    return hash;
}


// peudorandom gen
function getRandom(seed) {
    return function() {
        seed = (seed + 1) % 12345; // increment
        return (seed % 1000) / 1000; // Return 0 and 1
    }
}


function repositionOrbs() {
    orbs.forEach(orb => {
        const x = orb.position.x;
        const z = orb.position.z;
        const y = SurfaceOrbs(x, z) + orbRadius + 0.1;
        orb.position.y = y;
    });
}

