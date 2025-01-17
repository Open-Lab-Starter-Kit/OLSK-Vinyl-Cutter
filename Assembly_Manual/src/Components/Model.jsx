import React, { useRef, useEffect, useContext, useState, useMemo } from "react";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js"
import { extend, useThree } from "@react-three/fiber";
import { BackSide, Mesh, Box3, Group, BufferGeometry, MeshBasicMaterial, EdgesGeometry, LineBasicMaterial, LineSegments, BoxGeometry } from 'three'
import { ModelContext } from "/ModelContext.jsx";
import { useCallback } from "react";
import { Selection } from "@react-three/postprocessing";

import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import * as THREE from 'three';
import useInterface from "/stores/useInterface"


//Added for EdgesGeometry attempt
import { ConditionalEdgesShader } from '../ConditionalEdgesShader.js';

extend({ OutlineEffect })

//Array of step names
const stepsNames = []
//Array of names for navigation menu
const stepsNamesNavi = []

export default function Model({ modelIn, modelOut, modelInCopy, modelInCopy2, modelOutCopy }) {

    //Bvh - for selecting parts by clicking on the 3d model
    THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
    THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
    THREE.Mesh.prototype.raycast = acceleratedRaycast;

    console.log("render count")    //counts how many times the Model is executed

    const { gl, camera, scene } = useThree() //finds the renderer (gl)
    const machine = useRef()
    const machineAux = useRef()
    const machineOutline = useRef()
    const cylinder = useRef()
    const selected = useRef()

    gl.setPixelRatio(Math.min(window.devicePixelRatio, 2)) //Important for performance. Limits the pixel ratio. More than 2 is unecessary.

    let { stepCount, modelProperties, partsInOut, setVisibleModel, setCurrentStepObj, currentStepObject, selectedParts, setProperties, setCurrentObject, visibleObj } = useContext(ModelContext)

    const [stepName, setStepName] = useState(false)
    const [stepNameNavi, setStepNameNavi] = useState(false)
    const [model, setModel] = useState(modelInCopy2)
    const [modelOutlineCopy, setModelOutlineCopy] = useState()
    const [modelAux, setModelAux] = useState(modelInCopy)
    const [modelInCurrent, setModelInCurrent] = useState(modelInCopy2)
    const [clickedObj, setClickedObj] = useState()
    //const [line, setLine] = useState()
    const [edge, setEdge] = useState()
    const [geometry, setGeometry] = useState()
    const [savedSelectedParts, setSavedSelectedParts] = useState()
    const [currentModel, setCurrentObj] = useState()
    const [geoGroup, setGeoGroup] = useState()

    //Materials
    const machineMaterial = new MeshBasicMaterial({ color: 0xebebeb }) //for previous steps
    const machineCurrentMaterial = new MeshBasicMaterial({ color: 0xffffff }) //for previous steps
    const curvesMaterial = new MeshBasicMaterial({ color: 0xff0000, wireframe: true }) //for curves
    const highlightMaterial = new MeshBasicMaterial({ color: 0xd1e0e0 })    //for highlighted parts
    var lineMat = new LineBasicMaterial({ color: 0x404040, linewidth: 10 }); //machine wireframe
    var lineHighlightMat = new LineBasicMaterial({ color: 0x669999, linewidth: 50 }); //highlight wireframe
    var lineBuiltMat = new LineBasicMaterial({ color: 0xa6a6a6, linewidth: 10 });

    const material = new THREE.ShaderMaterial(ConditionalEdgesShader); //for conditional lines
    material.uniforms.diffuse.value.set(0x000000);

    //Fabulaser Mini V3 - steps grouping
    const exceptionArray = [ //shown alone

    ]
    const preparingStepArray = [ //shown grouped
        [
            "021_Prepare_the_head_front_plate"
        ],
        [
            "022_Prepare_the_head_back_plate",
            "023_Fix_the_bottom_carriage"
        ],
        [
            "051_Prepare_pinch_roller",
            "052_Fix_front_shaft",
            "053_Fix_the_spring"
        ],
        [
            "17_Prepare_Y_motor_holder"
        ],
        [
            "20_Install_electronics"
        ],
        [
            "21_Prepare_Side_Cover"
        ]
    ]
    const wiringStepArray = [ //add schematic
        "22_Wiring_and_cable_management"
    ]

    const mainMachineBuildArray = []
    let preparingTempArray = []
    const modelAuxGeometryArray = []
    let subPrepArray = []

    useEffect(() => { //controls the parts in and out status
        if (partsInOut === true) {
            setModel(modelInCopy2)
            setCurrentObj(modelInCopy2.getObjectByName(stepName[stepCount]))
        } else if (partsInOut === false) {
            setModel(modelOutCopy)
            setCurrentObj(modelOutCopy.getObjectByName(stepName[stepCount]))
        }
    }, [partsInOut])

    useEffect(() => { //activated once in the first render
        // if (machineOutline.current) {
        //     machineOutline.current.scale.multiplyScalar(1.5)
        // }
        //let groupGeo = new BufferGeometry()
        model.traverse((children) => { //creates and array with the step titles names
            if (children.isObject3D && !children.isMesh && !children.isGroup) {
                stepsNames.push(children.name) //for title
                stepsNamesNavi.push(children.userData.name) //for navigation
            }

        }, [])


        //sorts the step titles in the correct order for title
        stepsNames.sort()
        setStepName(stepsNames)
        //sorts the step titles in the correct order for navigation
        stepsNamesNavi.sort()
        setStepNameNavi(stepsNamesNavi)

        //applies material for already built part (modelAux)
        modelAux.traverse((o) => {
            if (o.isMesh) {
                o.material = machineMaterial
                o.frustumCulled = false //fixes disappearing faces
                var geo = new EdgesGeometry(o.geometry, 20); // or WireframeGeometry
                var wireframe = new LineSegments(geo, lineBuiltMat);
                o.add(wireframe);
                // const lineGeom = new ConditionalEdgesGeometry(BufferGeometryUtils.mergeVertices(o.geometry));
                // const line = new THREE.LineSegments(lineGeom, material)
                // o.add(line)
                //o.add(outline)
                //geo.dispose()
                o.geometry.dispose()
                machineMaterial.dispose()
            }
        })

        setCurrentStepObj(modelInCopy.getObjectByName(stepName[0]))
        setCurrentObj(model.getObjectByName(stepName[0]))

        partsListChange()

    }, [])

    const isException = exceptionArray.some(arr => arr.includes(stepName[stepCount])) //boolean
    const isPreparingStep = preparingStepArray.some(arr => arr.includes(stepName[stepCount])) //boolean
    const wiringStep = useInterface((state) => { return state.wiringStep })
    const isWiringStep = useInterface((state) => { return state.isWiringStep })
    const isNotWiringStep = useInterface((state) => { return state.isNotWiringStep })
    if (wiringStepArray.some(arr => arr.includes(stepName[stepCount]))) {
        isWiringStep()
    }
    else {
        isNotWiringStep()
    }


    useEffect(() => { //activates if stepCount or stepName changed
        setCurrentStepObj(modelInCopy2.getObjectByName(stepName[stepCount])) //assigns the model of current step
        setCurrentObj(model.getObjectByName(stepName[stepCount]))
    }, [stepName, stepCount])

    useEffect(() => {
        console.log(currentStepObject)
        partsListChange()
    }, [stepName, stepCount, currentStepObject])

    useEffect(() => {
        if (currentModel) {

            setCurrentObject(currentModel.getObjectByName(stepName[stepCount])) //assigns the model of current step
            if (selectedParts != []) {
                highlightParts()
            }

        }
    }, [selectedParts, currentModel])

    //creates current step list of parts and title
    const partsListChange = useCallback(() => {
        //setCurrentStepObj(currentStepObject)
        let uniqueNames = []
        let partsCount = []
        const partsNamesArray = []
        //Alternative1 - takes the name of parts indenpendent of currentStepObject
        /* let stepTitle
        for (let i = 0; i < modelIn.scene.children.length; i++) { 
            if (modelIn.scene.children[i].name === `${stepName[stepCount]}`) {
                modelIn.scene.children[i].traverse((children) => {
                    //finds the name of the parts in the current step
                    if (children.isGroup) {
                        partsNamesArray.push(children.userData.name)
                    }
                    //unifies repeated names
                    uniqueNames = [...new Set(partsNamesArray)]
                    //counts repeated names in the array
                    partsCount = uniqueNames.map(value => [partsNamesArray.filter(str => str === value).length, value])

                    //finds the name of the step title in the current step
                    if (children.isObject3D && !children.isMesh && !children.isGroup && children.userData.name != undefined) {
                        stepTitle = children.userData.name
                    }
                })
            }
        }
        setProperties({ partsNames: partsCount, titleName: stepTitle }) */

        //Alternative 2 - traverses only the currentStepObject
        if (currentStepObject) {

            for (let i = 0; i < currentStepObject.children.length; i++) {
                currentStepObject.children[i].traverse((children) => {
                    //finds the name of the parts in the current step
                    if (children.isGroup && children.userData.name != undefined) {
                        partsNamesArray.push(children.userData.name)
                    }
                    //unifies repeated names
                    uniqueNames = [...new Set(partsNamesArray)]
                    //counts repeated names in the array
                    partsCount = uniqueNames.map(value => [partsNamesArray.filter(str => str === value).length, value])

                })
            }
            //finds the name of the step title in the current step
            const stepTitle = currentStepObject.userData.name
            setProperties({ partsNames: partsCount, titleName: stepTitle })
        }


    })

    const includePreviousStep = useCallback(() => {
        for (let n = stepCount - 1; n >= 0; n--) { //count down for previous steps
            for (let m = subPrepArray.length - 1; m >= 0; m--) { // count down the elements from subArray
                if (stepName[n] === subPrepArray[m]) { //if the current step is the same as in the subPrepArray, retrieves the model and adds to the preparringTemArray
                    let previousStepsModel = modelAux.getObjectByName(`${stepName[n]}`, true)
                    preparingTempArray.push(previousStepsModel)
                    if (stepName[n + 1] === "023_Fix_the_bottom_carriage") {
                        let exceptionPreparingStepModel = modelAux.getObjectByName("022_Prepare_the_head_back_plate", true)
                        let exceptionPreparingStepModel2 = modelAux.getObjectByName("021_Prepare_the_head_front_plate", true)
                        preparingTempArray.push(exceptionPreparingStepModel)
                        preparingTempArray.push(exceptionPreparingStepModel2)
                    }
                }
            }
        }
    })

    const preparingStepChange = useCallback(() => {

        for (let k = 0; k < preparingStepArray.length; k++) { //separates the individual arrays inside preparingStepArray
            subPrepArray = preparingStepArray[k];
            for (let j = 0; j < subPrepArray.length; j++) { //goes through every indiviual name inside the array
                const isPreparingStepTemp = subPrepArray.some(arr => arr.includes(stepName[stepCount])); //boolean - true if the current step name is found in the subarray
                if (isPreparingStepTemp) {
                    includePreviousStep()
                }
            }
        }

        let groupVisibleObjPrep = new Group()
        let clonedCurrentStepObject = currentModel.clone()
        groupVisibleObjPrep.add(clonedCurrentStepObject)
        //Go through each item of the preparingTempArray and display only what is not in the exception list
        preparingTempArray.filter(obj => preparingStepArray.some(arr => arr.includes(obj.name)))
            .forEach(obj => {
                obj.visible = true;
                let clonedObj = obj.clone();
                groupVisibleObjPrep.add(clonedObj)
            });

        //saves the visible objects to use in the visualization bounding box  
        setVisibleModel(groupVisibleObjPrep)

    })

    const mainMachineBuildStepChange = useCallback(() => {
        //If it is NOT listed in the exception Array or the preparing array, add it to the mainMachineBuildArray to be displayed later
        //counts backwards the models of the previous steps
        for (let i = stepCount - 1; i >= 0; i--) {
            let previousStepsModel = modelAux.getObjectByName(`${stepName[i]}`, true)
            mainMachineBuildArray.push(previousStepsModel)
        }
        let excludeArray = []
        if (stepName[stepCount] === "24_Fix_side_covers") {
            excludeArray = [
                "21_Prepare_Side_Cover"
            ]
            console.log("exception")
        }
        let groupVisibleObj = new Group()
        let geometriesArray = []
        //Go through each item of the mainMachineBuildArray and display only what is not in the exception list
        mainMachineBuildArray.filter(obj => !excludeArray.some(arr => arr.includes(obj.name)))
            .forEach(obj => {
                obj.visible = true;
                let clonedObj = obj.clone();
                groupVisibleObj.add(clonedObj)
            });

        let clonedCurrentStepObject = currentModel.clone()
        groupVisibleObj.add(clonedCurrentStepObject)
        //saves the visible objects to use in the visualization bounding box    
        setVisibleModel(groupVisibleObj)
    })

    const highlightParts = useCallback(() => {
        //console.log(model.scene, selectedParts)
        if (currentModel) {
            const geometriesArray = []
            for (let i = 0; i < currentModel.children.length; i++) {
                currentModel.children[i].traverse((mesh) => {
                    if (mesh.isMesh && selectedParts.includes(currentModel.children[i].userData.name)) {
                        mesh.frustumCulled = false //fixes disappearing faces
                        const clonedGeometry = mesh.geometry.clone()
                        geometriesArray.push(clonedGeometry)
                        mesh.material = highlightMaterial
                        var geometry = new EdgesGeometry(mesh.geometry, 20); // or WireframeGeometry
                        var wireframeHighlight = new LineSegments(geometry, lineHighlightMat);
                        mesh.add(wireframeHighlight);
                        highlightMaterial.dispose()
                        geometry.dispose()
                        lineHighlightMat.dispose()
                    } else if (mesh.isMesh && currentModel.children[i].userData.name != "Curves") {
                        mesh.frustumCulled = false //fixes disappearing faces
                        mesh.material = machineCurrentMaterial
                        var geometry = new EdgesGeometry(mesh.geometry, 20); // or WireframeGeometry
                        var wireframe = new LineSegments(geometry, lineMat);
                        mesh.add(wireframe);
                        geometry.dispose()
                        lineMat.dispose()
                    }
                    else if (mesh.userData.name === "Curves") { //Assigns material to curves
                        mesh.material = curvesMaterial
                        if (mesh.isGroup) {
                            for (let i = 0; i < mesh.children.length; i++) {
                                if (mesh.children[i].isMesh) {
                                    mesh.children[i].material = curvesMaterial
                                }

                            }
                        }
                        //curvesMaterial.dispose()
                    }
                })
            }

            setSavedSelectedParts(selectedParts)
        }

    })

    const stepChange = useCallback(() => {

        if (currentModel) {
            const currentModelCopy = currentModel.clone()

            for (let i = 0; i < model.children.length; i++) {
                //initially makes the model invisible
                model.children[i].visible = false
            }

            for (let i = 0; i < modelAux.children.length; i++) {
                //initially makes the modelAux invisible
                modelAux.children[i].visible = false
            }

            //If it is listed in the exception Array, show model
            if (isException) {
                console.log("exception")
                currentModel.visible = true;
                setVisibleModel(currentModel);
            }
            else if (isPreparingStep) {
                console.log("preparing step")
                currentModel.visible = true;
                preparingStepChange()

            }
            else {
                console.log("main building step")
                currentModel.visible = true;
                mainMachineBuildStepChange()
            }
        }

    }, [currentModel])

    useEffect(() => { //activated if currentStepObject changed
        stepChange()
        //console.log(state)
    }, [currentModel])

    const { setListOfStep } = useContext(ModelContext)
    setListOfStep(stepNameNavi)


    const [hovered, hover] = useState(null)
    return <>

        <Selection>


            {stepName ? (<>
                < primitive ref={machine}
                    object={model}
                    scale={1.0001}

                >
                </primitive >
                < primitive ref={machineAux}
                    object={modelAux}
                    scale={1}
                >
                </primitive >
            </>
            ) : null
            }


        </Selection>

    </>

}
export const MemoizedModel = React.memo(Model)