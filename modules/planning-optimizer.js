// modules/planning-optimizer.js

const AVG_SPEED_KMH = 50; 
const DEFAULT_START_HOUR = "08:00";
const BUFFER_BEFORE_DEADLINE = 10; 

// Fonction principale
export function calculatePerfectRoute(selectedChantiers, startCoords = { lat: 50.226, lng: 5.344 }, teamSizeMap = {}) {
    
    let fixed = selectedChantiers.filter(c => c.fixedAppointment);
    let flexible = selectedChantiers.filter(c => !c.fixedAppointment);

    // --- 1. LOGIQUE DE DÉPART (Rétro-planning) ---
    // On regarde si on doit commencer plus tôt à cause d'une heure de FIN imposée
    let startMinutes = timeToMinutes(DEFAULT_START_HOUR); 
    let firstJobForced = null;

    const urgentJobs = flexible.filter(c => c.timeWindowEnd);
    urgentJobs.forEach(job => {
        const deadline = timeToMinutes(job.timeWindowEnd);
        const nbWorkers = teamSizeMap[job.id] || 1;
        const durationTotalMin = (job.totalHeuresPrevues || 0) * 60;
        const realDurationMin = durationTotalMin / nbWorkers;

        const estimatedTravel = 30; 
        const mustStartAt = deadline - BUFFER_BEFORE_DEADLINE - realDurationMin;
        const departureFromDepot = mustStartAt - estimatedTravel;

        if (departureFromDepot < startMinutes) {
            startMinutes = departureFromDepot;
            firstJobForced = job; 
        }
    });

    // Arrondi au 5 min
    startMinutes = Math.floor(startMinutes / 5) * 5;

    // Si un job force le départ (deadline serrée), il passe en premier
    if (firstJobForced) {
        flexible = flexible.filter(c => c.id !== firstJobForced.id);
        flexible.unshift(firstJobForced);
    } else {
        // Sinon tri intelligent : Ceux avec deadline d'abord
        flexible.sort((a, b) => {
            if (a.timeWindowEnd && !b.timeWindowEnd) return -1;
            if (!a.timeWindowEnd && b.timeWindowEnd) return 1;
            if (a.timeWindowEnd && b.timeWindowEnd) return timeToMinutes(a.timeWindowEnd) - timeToMinutes(b.timeWindowEnd);
            return 0;
        });
    }

    fixed.sort((a, b) => timeToMinutes(a.fixedAppointment) - timeToMinutes(b.fixedAppointment));

    // --- 2. CONSTRUCTION DE LA JOURNÉE ---
    let timeline = [];
    let currentTime = startMinutes;
    let currentLocation = startCoords;
    let remaining = [...flexible];

    // Boucle tant qu'il y a du travail
    while (remaining.length > 0 || fixed.length > 0) {
        
        // A. GESTION RDV FIXES (Priorité absolue)
        let nextFixed = fixed.length > 0 ? fixed[0] : null;
        if (nextFixed) {
            const rdvTime = timeToMinutes(nextFixed.fixedAppointment);
            const distToFixed = getDistance(currentLocation, nextFixed.coordinates);
            const travelToFixed = (distToFixed / AVG_SPEED_KMH) * 60;
            
            // On y va si on n'a plus le temps de faire autre chose avant
            if (remaining.length === 0 || currentTime + travelToFixed >= rdvTime - 15) { 
                
                timeline.push({ type: 'travel', duration: Math.round(travelToFixed), from: '...', to: nextFixed.name });
                currentTime += travelToFixed;

                if (currentTime < rdvTime) {
                    timeline.push({ type: 'wait', duration: Math.round(rdvTime - currentTime) });
                    currentTime = rdvTime;
                }

                const nbWorkers = teamSizeMap[nextFixed.id] || 1;
                const durationTotalMin = (nextFixed.totalHeuresPrevues || 1) * 60;
                const realDurationMin = durationTotalMin / nbWorkers;

                timeline.push({
                    type: 'job', ...nextFixed,
                    start: minutesToTime(currentTime),
                    end: minutesToTime(currentTime + realDurationMin)
                });
                
                currentTime += realDurationMin;
                currentLocation = nextFixed.coordinates || currentLocation;
                fixed.shift(); 
                continue; 
            }
        }

        // B. GESTION JOBS FLEXIBLES
        if (remaining.length > 0) {
            let bestIndex = -1;
            let bestScore = Infinity; 

            for (let i = 0; i < remaining.length; i++) {
                const job = remaining[i];
                if (!job.coordinates) continue;

                const dist = getDistance(currentLocation, job.coordinates);
                let score = dist;

                // Si deadline de fin, urgence ++
                if (job.timeWindowEnd) {
                    score -= 1000; 
                    const travel = (dist / AVG_SPEED_KMH) * 60;
                    const arrivalTime = currentTime + travel;
                    const maxTime = timeToMinutes(job.timeWindowEnd) - BUFFER_BEFORE_DEADLINE;
                     if (arrivalTime > maxTime) score += 5000; 
                }

                score += (i * 2); // Légère préférence pour l'ordre de liste (qui est déjà trié par urgence)

                if (score < bestScore) {
                    bestScore = score;
                    bestIndex = i;
                }
            }

            if (bestIndex !== -1) {
                const job = remaining[bestIndex];
                const dist = getDistance(currentLocation, job.coordinates);
                const travel = (dist / AVG_SPEED_KMH) * 60;

                // 1. Ajouter le trajet
                timeline.push({ type: 'travel', duration: Math.round(travel), from: '...', to: job.name });
                currentTime += travel;

                // 2. VÉRIFICATION CRITIQUE : HEURE D'OUVERTURE
                if (job.timeWindowStart) {
                    const openTime = timeToMinutes(job.timeWindowStart);
                    // Si on arrive trop tôt (ex: arrive à 8h18, ouvre à 10h00)
                    if (currentTime < openTime) {
                         // On force l'attente
                         timeline.push({ type: 'wait', duration: Math.round(openTime - currentTime), reason: "Ouverture chantier" });
                         currentTime = openTime; // On avance l'heure actuelle à l'heure d'ouverture
                    }
                }

                const nbWorkers = teamSizeMap[job.id] || 1;
                const durationTotalMin = (job.totalHeuresPrevues || 1) * 60;
                const realDurationMin = durationTotalMin / nbWorkers;

                timeline.push({
                    type: 'job', ...job,
                    start: minutesToTime(currentTime),
                    end: minutesToTime(currentTime + realDurationMin)
                });

                currentTime += realDurationMin;
                currentLocation = job.coordinates;
                remaining.splice(bestIndex, 1);
            } else {
                remaining.shift();
            }
        }
    }

    return timeline;
}

// --- UTILITAIRES ---

function getDistance(coord1, coord2) {
    if (!coord1 || !coord2) return 999;
    const R = 6371; 
    const dLat = deg2rad(coord2.lat - coord1.lat);
    const dLon = deg2rad(coord2.lng - coord1.lng);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(deg2rad(coord1.lat)) * Math.cos(deg2rad(coord2.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function deg2rad(deg) { return deg * (Math.PI / 180); }

function timeToMinutes(t) { 
    if(!t) return 0;
    const [h, m] = t.split(':').map(Number); 
    return h * 60 + m; 
}

function minutesToTime(m) { 
    if (m < 0) m += 1440; 
    const h = Math.floor(m / 60) % 24; 
    const min = Math.round(m % 60);
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`; 
}