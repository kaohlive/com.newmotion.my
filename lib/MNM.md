# Very simple My.NewMotion.com API
```js
const MNM = require('./mnm')
```

## Get all charging points near a location
Lat, Lon, distance (meters)
returns a promise

```js
MNM.near(51.759622, 5.533371, 700)
```

## Get a single charging point
Charging point ID
returns a promise

```js
MNM(183332)
```