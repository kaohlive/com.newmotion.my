'use strict'
const MNM = require('./mnm')
const CP = require('../drivers/chargepoint/chargepoint')

MNM.near(51.759653, 5.533532, 10000)
    .then((points) => {
        points = points.map(CP.enhance)
        console.log(JSON.stringify(points))
    })
    .catch(console.error)