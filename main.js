// ==== 고정된 목표 지점 좌표 ====
const TARGETS = [
  { id: 1, name: "네오위즈", lat: 37.399979, lon: 127.104181,
    distEl: "dist1", bearEl: "bear1", turnEl: "turn1", arrowEl: "arrow1" },
  { id: 2, name: "lowiro 본사", lat: 51.5172646, lon: -0.1398826,
    distEl: "dist2", bearEl: "bear2", turnEl: "turn2", arrowEl: "arrow2" },
];

const els = {
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  lat: document.getElementById("lat"),
  lon: document.getElementById("lon"),
  acc: document.getElementById("acc"),
  ts: document.getElementById("ts"),
  deviceHeading: document.getElementById("deviceHeading"),
  headingSource: document.getElementById("headingSource"),
  deviceNeedle: document.getElementById("deviceNeedle"),
};

let watchId = null;
let state = {
  lat: null,
  lon: null,
  acc: null,
  ts: null,
  deviceHeading: null, // 0~360 (진북 기준 시계 방향) or null
  headingSource: "—",
};

function toFixed(n, d=6){ return (n==null? "—" : n.toFixed(d)); }
function pad(n){ return n.toString().padStart(2, "0"); }
function fmtTime(ts){
  if(!ts) return "—";
  const t = new Date(ts);
  return `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
}

// 도(deg)↔라디안(rad)
const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;

// 하버사인 거리 (m)
function haversine(lat1, lon1, lat2, lon2){
  const R = 6371_000; // meters
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δφ = toRad(lat2-lat1), Δλ = toRad(lon2-lon1);
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 초기 방위각 (진북 기준, 0~360)
function initialBearing(lat1, lon1, lat2, lon2){
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  let θ = toDeg(Math.atan2(y, x)); // -180..+180
  if (θ < 0) θ += 360;
  return θ; // 0..360
}

function dirText(deg){
  const dirs = ["북","북북동","북동","동북동","동","동남동","남동","남남동","남","남남서","남서","서남서","서","서북서","북서","북북서"];
  const idx = Math.round(deg / 22.5) % 16;
  return dirs[idx];
}

function fmtBearing(deg){
  return `${deg.toFixed(1)}° (${dirText(deg)})`;
}

function fmtDistance(m){
  if (m == null) return "—";
  if (m < 1000) return `${m.toFixed(0)} m`;
  return `${(m/1000).toFixed(2)} km`;
}

// deviceHeading 대비 회전 지시 (좌/우, 최소 회전각)
function turnInstruction(targetBearing, deviceHeading){
  if (deviceHeading == null) return "나침반 센서 없음";
  // delta: (-180, 180]
  const delta = ((((targetBearing - deviceHeading) % 360) + 540) % 360) - 180;
  const abs = Math.abs(delta).toFixed(1);
  if (Math.abs(delta) < 1) return "정확히 정면";
  return delta > 0 ? `오른쪽으로 ${abs}° 회전` : `왼쪽으로 ${abs}° 회전`;
}

function setArrowRotation(elId, degrees){
  const el = document.getElementById(elId);
  if (!el) return;
  el.style.transform = `rotate(${degrees}deg)`;
}

// 위치/나침반 표시 업데이트
function render(){
  els.lat.textContent = state.lat==null ? "—" : state.lat.toFixed(6);
  els.lon.textContent = state.lon==null ? "—" : state.lon.toFixed(6);
  els.acc.textContent = state.acc==null ? "—" : `${state.acc.toFixed(0)} m`;
  els.ts.textContent = fmtTime(state.ts);

  if (state.deviceHeading==null){
    els.deviceHeading.textContent = "—";
    els.deviceNeedle.style.transform = `translate(-50%, -50%) rotate(0deg)`;
  } else {
    els.deviceHeading.textContent = `${state.deviceHeading.toFixed(1)}°`;
    els.deviceNeedle.style.transform = `translate(-50%, -50%) rotate(${state.deviceHeading}deg)`;
  }
  els.headingSource.textContent = `센서 상태: ${state.headingSource}`;

  if (state.lat==null || state.lon==null) return;

  for (const t of TARGETS){
    const d = haversine(state.lat, state.lon, t.lat, t.lon);
    const b = initialBearing(state.lat, state.lon, t.lat, t.lon);

    document.getElementById(t.distEl).textContent = fmtDistance(d);
    document.getElementById(t.bearEl).textContent = fmtBearing(b);
    document.getElementById(t.turnEl).textContent = turnInstruction(b, state.deviceHeading);

    // 화살표: 기기 기준 회전 각도 (없으면 진북 기준으로만 표시)
    const rel = state.deviceHeading==null ? b : (((b - state.deviceHeading) % 360) + 360) % 360;
    setArrowRotation(t.arrowEl, rel);
  }
}

// ===== Geolocation =====
function startLocationWatch(){
  if (!("geolocation" in navigator)){
    alert("이 브라우저는 Geolocation을 지원하지 않습니다.");
    return;
  }
  stopLocationWatch(); // 중복 방지
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      state.lat = latitude;
      state.lon = longitude;
      state.acc = accuracy;
      state.ts = pos.timestamp;
      render();
    },
    (err) => {
      console.error(err);
      alert("위치 정보를 가져오지 못했습니다: " + err.message);
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 1000
    }
  );
}

function stopLocationWatch(){
  if (watchId!=null){
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

// ===== Device Orientation (나침반) =====
let orientationActive = false;

function handleOrientation(e, sourceLabel){
  // iOS Safari 우선: webkitCompassHeading (0=북, 시계방향 증가)
  let heading = null;
  const anyE = /** @type {*} */ (e);
  if (typeof anyE.webkitCompassHeading === "number" && !Number.isNaN(anyE.webkitCompassHeading)){
    heading = anyE.webkitCompassHeading; // already clockwise from North
  } else if (typeof e.alpha === "number"){
    // alpha: 디바이스의 Z축 회전 (일반적으로 0=북). 일부 브라우저는 시계반대 증가 -> 보정
    // 보편적 근사: 0..360으로 뒤집어 시계방향 증가값으로 변환
    heading = (360 - e.alpha);
    // 절대값 여부 안내
  }

  if (heading!=null){
    // 정규화 0..360
    heading = ((heading % 360) + 360) % 360;
    state.deviceHeading = heading;
    state.headingSource = sourceLabel + (e.absolute ? " (absolute)" : "");
    render();
  }
}

async function requestOrientationPermission(){
  try{
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function"){
      // iOS 13+
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== "granted"){
        state.headingSource = "권한 거부(iOS)";
        state.deviceHeading = null;
        render();
        return;
      }
    }
    // Event 구독 (absolute 우선, 그 다음 일반)
    if (!orientationActive){
      orientationActive = true;
      // 일부 브라우저: deviceorientationabsolute
      window.addEventListener("deviceorientationabsolute", (e)=>handleOrientation(e, "deviceorientationabsolute"), true);
      window.addEventListener("deviceorientation", (e)=>handleOrientation(e, "deviceorientation"), true);
    }
    state.headingSource = "센서 대기중…";
    render();
  }catch(err){
    console.error(err);
    state.headingSource = "나침반 센서 접근 실패";
    render();
  }
}

// ===== UI Control =====
els.startBtn.addEventListener("click", async ()=>{
  startLocationWatch();
  await requestOrientationPermission();
});

els.stopBtn.addEventListener("click", ()=>{
  stopLocationWatch();
  state.deviceHeading = null;
  state.headingSource = "—";
  render();
});

// 초기 렌더
render();
