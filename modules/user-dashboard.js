// modules/user-dashboard.js

import { collection, query, where, getDocs, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent } from "../app.js";

let currentWeekOffset = 0;
let scheduleDataCache = [];

export function render() {
    pageContent.innerHTML = `
        <div class="max-w-7xl mx-auto">
            <div class="flex flex-wrap justify-between items-center mb-4 gap-4">
                <h2 class="text-2xl font-bold">🗓️ Planning de la Semaine</h2>
                <button id="downloadPdfBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>
                    Télécharger PDF
                </button>
            </div>
            <div class="bg-white rounded-lg shadow-sm p-4 mb-4">
                <div class="flex justify-between items-center">
                    <button id="prevWeekBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&lt;</button>
                    <div id="currentPeriodDisplay" class="text-center font-semibold text-lg"></div>
                    <button id="nextWeekBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">&gt;</button>
                </div>
            </div>
            <div id="schedule-grid" class="grid grid-cols-1 md:grid-cols-7 gap-2"></div>
        </div>
    `;

    document.getElementById("prevWeekBtn").onclick = () => { currentWeekOffset--; displayWeekView(); };
    document.getElementById("nextWeekBtn").onclick = () => { currentWeekOffset++; displayWeekView(); };
    document.getElementById("downloadPdfBtn").onclick = generatePDF;

    currentWeekOffset = 0;
    displayWeekView();
}

function displayWeekView() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    const options = { day: 'numeric', month: 'long' };
    document.getElementById("currentPeriodDisplay").textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', options)} au ${endOfWeek.toLocaleDateString('fr-FR', options)}`;
    
    const scheduleGrid = document.getElementById("schedule-grid");
    scheduleGrid.innerHTML = "<p class='text-center text-gray-500 p-4 col-span-7'>Chargement du planning...</p>";

    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    let gridHtml = '';
    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(startOfWeek);
        dayDate.setDate(startOfWeek.getDate() + i);
        gridHtml += `
            <div class="bg-gray-50 rounded-lg p-2 min-h-[100px]">
                <h4 class="font-bold text-center border-b pb-1 mb-2">
                    ${days[i]} <span class="text-sm font-normal text-gray-500">${dayDate.toLocaleDateString('fr-FR', {day: '2-digit'})}</span>
                </h4>
                <div id="day-col-${i}" class="space-y-2"></div>
            </div>
        `;
    }
    scheduleGrid.innerHTML = gridHtml;
    
    loadUserScheduleForWeek(startOfWeek, endOfWeek);
}

async function loadUserScheduleForWeek(start, end) {
    scheduleDataCache = [];
    const scheduleGrid = document.getElementById("schedule-grid");
    
    const weekId = start.toISOString().split('T')[0];
    const publishDocRef = doc(db, "publishedSchedules", weekId);
    const publishDoc = await getDoc(publishDocRef);

    if (!publishDoc.exists()) {
        scheduleGrid.innerHTML = `<p class='col-span-1 md:col-span-7 text-center text-gray-500 p-4'>Le planning de cette semaine n'a pas encore été publié.</p>`;
        return;
    }

    const planningCollectionRef = collection(db, "planning");
    const q = query(
        planningCollectionRef,
        where("date", ">=", start.toISOString().split('T')[0]),
        where("date", "<=", end.toISOString().split('T')[0]),
        orderBy("date")
    );

    try {
        const querySnapshot = await getDocs(q);
        scheduleDataCache = querySnapshot.docs.map(doc => doc.data());

        for (let i = 0; i < 7; i++) {
            const dayCol = document.getElementById(`day-col-${i}`);
            if (dayCol) dayCol.innerHTML = '';
        }

        if (querySnapshot.empty) {
            return;
        }
        
        scheduleDataCache.forEach(data => {
            const dayIndex = (new Date(data.date + 'T00:00:00').getDay() + 6) % 7;
            const container = document.getElementById(`day-col-${dayIndex}`);
            if (container) {
                container.appendChild(createTaskElement(data));
            }
        });

    } catch (error) {
        console.error("Erreur de chargement du planning:", error);
    }
}

function createTaskElement(task) {
    const taskElement = document.createElement('div');
    taskElement.className = 'bg-white p-3 rounded-lg shadow-sm border-l-4 border-purple-500 text-sm';
    
    const withText = task.teamNames && task.teamNames.length > 0 ? `Équipe : ${task.teamNames.join(', ')}` : 'Pas d\'équipe';
    const startTimeText = task.startTime ? `<strong>${task.startTime}</strong> - ` : '';
    const noteText = task.notes ? `<div class="mt-2 pt-2 border-t border-gray-200 text-blue-600 text-xs"><strong>Note:</strong> ${task.notes}</div>` : '';
    
    taskElement.innerHTML = `
        <div class="font-semibold">${task.chantierName}</div>
        <div class="text-xs text-gray-700 mt-1">${startTimeText}${task.duration || ''}h prévues</div>
        <div class="text-xs text-gray-500 mt-1">${withText}</div>
        ${noteText}
    `;
    return taskElement;
}

function generatePDF() {
    if (scheduleDataCache.length === 0) {
        alert("Il n'y a rien à télécharger pour cette semaine.");
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const periodText = document.getElementById("currentPeriodDisplay").textContent;

    doc.setFontSize(18);
    doc.text("Planning de la semaine", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(periodText, 14, 30);

    const tableData = scheduleDataCache.map(task => {
        const day = new Date(task.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit' });
        const timeInfo = task.startTime ? `${task.startTime} (${task.duration}h)` : `${task.duration}h prévues`;
        const team = task.teamNames ? task.teamNames.join(', ') : '';
        return [
            day,
            task.chantierName,
            timeInfo,
            team,
            task.notes || ''
        ];
    });

    doc.autoTable({
        startY: 40,
        head: [['Jour', 'Chantier', 'Horaires', 'Équipe', 'Notes']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [67, 56, 202] }
    });

    const fileName = `planning_general_${periodText.replace(/ /g, '_')}.pdf`;
    doc.save(fileName);
}

function getWeekDateRange(offset = 0) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) + (offset * 7);
    const startOfWeek = new Date(now.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    return { startOfWeek, endOfWeek };
}