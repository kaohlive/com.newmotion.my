'use strict'
const atan2 = Math.atan2
const cos = Math.cos
const sin = Math.sin
const sqrt = Math.sqrt
const Radius = 6378137 //meters

const squared = (x) => x * x
const toRad = (x) => x * Math.PI / 180.0

module.exports = {}

function normalize(p) {
    return {
        lat: p.latitude || p.lat,
        lon: p.longitude || p.lng || p.lon
    }
}

module.exports.square = function (p, d) {
    p = normalize(p)

    const degChangeLat = d / toRad(Radius)
    const degChangeLon = d / toRad(Radius) * cos(toRad(p.lat))

    return [{
        lat: p.lat - degChangeLat,
        lon: p.lon - degChangeLon
    }, {
        lat: p.lat + degChangeLat,
        lon: p.lon + degChangeLon
    }]
}

module.exports.distance = function (a, b) {
    a = normalize(a)
    b = normalize(b)

    const dLat = toRad(b.lat - a.lat)
    const dLon = toRad(b.lon - a.lon)

    var f = squared(sin(dLat / 2.0)) + cos(toRad(a.lat)) * cos(toRad(b.lat)) * squared(sin(dLon / 2.0))
    var c = 2 * atan2(sqrt(f), sqrt(1 - f))

    return Radius * c
}