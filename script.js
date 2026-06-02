// script.js

// ⚠️ ใส่ Web App URL ที่คุณ Deploy ได้จาก GAS ลงในบรรทัดนี้
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbw0lWE9R321opRFvsQKTniiZZAIRQHcBsYuCnPjNLk90AOKklYsl0cZfy4O5NogPYC3/exec';

// ตัวแปรเก็บ State หลัก
let allData = [];
let filteredData = [];
let sheetHeaders = [];
let globalCurrentDateObj = null; 

let scoreSortDirection = 'none';
let cumulativeChartInstance = null;

// ตัวแปรสำหรับกราฟ Stacked Bar (Drill-down)
let deptStackedChartInstance = null;
let currentDeptView = null; // null = โชว์ Department, string = โชว์ Sub-Dept ของแผนกนั้น

const FILTER_COLUMNS = [
    "ผู้รับ CAR/PAR (Department)",
    "ผู้รับ CAR/PAR (Sub-Department)",
    "สถานะ ตอบกลับเลท/ไม่เลท",
    "สถานะยื่นเอกสารปิด CAR/PAR"
];

const PIVOT_COL_DEPT = "ผู้รับ CAR/PAR (Department)";
const PIVOT_COL_SUBDEPT = "ผู้รับ CAR/PAR (Sub-Department)";
const PIVOT_COL_REPLY_STATUS = "สถานะ ตอบกลับเลท/ไม่เลท"; 
const PIVOT_ROW1 = "สถานะยื่นเอกสารปิด CAR/PAR";         
const PIVOT_ROW2 = "เลขที่ CAR/PAR";                    
const PIVOT_VALUE = "สถานะ แก้ไขเลท/ไม่เลทจากที่กำหนดเสร็จ"; 

const SCORE_COL = "%คะแนน การปิด CAR อย่างมีประสิทธิภาพ";

// ลำดับและสีของ Stacked Bar Chart
const STACK_STATUSES = [
    "ยื่นปิดแล้ว",
    "ยังไม่ยื่นปิด (Ondue) @สิ้นปี 2569",
    "ยังไม่ยื่นปิด (Overdue) @สิ้นปี 2569",
    "ยังไม่ยื่นปิด (Ondue)",
    "ยังไม่ยื่นปิด (Overdue)",
    "ยังไม่ตอบกลับ (On track)",
    "ยังไม่ตอบกลับ (Late)"
];

const STACK_COLORS = {
    "ยื่นปิดแล้ว": "rgba(16, 185, 129, 0.85)", // emerald-500
    "ยังไม่ยื่นปิด (Ondue) @สิ้นปี 2569": "rgba(245, 158, 11, 0.85)", // amber-500
    "ยังไม่ยื่นปิด (Overdue) @สิ้นปี 2569": "rgba(239, 68, 68, 0.85)", // red-500
    "ยังไม่ยื่นปิด (Ondue)": "rgba(251, 191, 36, 0.85)", // amber-400
    "ยังไม่ยื่นปิด (Overdue)": "rgba(248, 113, 113, 0.85)", // red-400
    "ยังไม่ตอบกลับ (On track)": "rgba(251, 146, 60, 0.85)", // orange-400
    "ยังไม่ตอบกลับ (Late)": "rgba(220, 38, 38, 0.85)" // red-600
};

// เริ่มต้นทำงาน
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
});

// ฟังก์ชันสลับหน้า (Tabs)
function switchTab(viewId) {
    document.getElementById('mainView').classList.add('hidden');
    document.getElementById('urgentView').classList.add('hidden');
    document.getElementById('closingView').classList.add('hidden');
    document.getElementById('scoreView').classList.add('hidden');
    document.getElementById('pivotView').classList.add('hidden');
    
    document.getElementById(viewId).classList.remove('hidden');

    const activeClass = "border-indigo-500 text-indigo-600";
    const inactiveClass = "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300";

    document.getElementById('tab-mainView').className = `whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${viewId === 'mainView' ? activeClass : inactiveClass}`;
    document.getElementById('tab-urgentView').className = `whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${viewId === 'urgentView' ? 'border-rose-500 text-rose-600' : inactiveClass}`;
    document.getElementById('tab-closingView').className = `whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${viewId === 'closingView' ? 'border-amber-500 text-amber-600' : inactiveClass}`;
    document.getElementById('tab-scoreView').className = `whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${viewId === 'scoreView' ? 'border-blue-500 text-blue-600' : inactiveClass}`;
    document.getElementById('tab-pivotView').className = `whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${viewId === 'pivotView' ? activeClass : inactiveClass}`;

    if(viewId === 'pivotView') renderPivotTable();
    if(viewId === 'urgentView') renderUrgentTable();
    if(viewId === 'closingView') renderClosingTable();
    if(viewId === 'scoreView') renderScoreTable();
}

function parseThaiDate(dateStr) {
    if (!dateStr || dateStr === '-' || dateStr.trim() === '') return null;
    const parts = dateStr.trim().split(/\s+/); 
    if (parts.length < 3) return null; 
    
    const day = parseInt(parts[0], 10);
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const month = months.indexOf(parts[1]);
    
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000; 
    
    if (isNaN(day) || month === -1 || isNaN(year)) return null;
    return new Date(year, month, day);
}

// **ฟังก์ชันนี้ถูกเปลี่ยนมาใช้ fetch() สำหรับรันบน GitHub Pages**
async function fetchData() {
    showLoading(true);
    try {
        // เพิ่ม { redirect: 'follow' } เพื่อรองรับการเปลี่ยนเส้นทางของ Google
        const response = await fetch(GAS_API_URL, {
            method: 'GET',
            redirect: 'follow' 
        });
        
        // รับค่าเป็น Text ก่อน แล้วค่อยแปลงเป็น JSON เพื่อป้องกัน Error จาก GAS
        const responseText = await response.text();
        const result = JSON.parse(responseText);
        
        if (result.error) {
            onDataError(result.error);
            return;
        }
        
        onDataLoaded(result);
    } catch (error) {
        onDataError("เกิดปัญหา CORS หรือไม่สามารถเชื่อมต่อฐานข้อมูลได้ (โปรดเช็คการ Deploy GAS)");
        console.error("Fetch Details:", error);
    }
}

function onDataLoaded(response) {
    allData = response.data || [];
    filteredData = [...allData];
    // ดึง Header มาจากข้อมูลที่มี เผื่อ GAS ไม่ได้ส่งมาให้
    sheetHeaders = response.headers || (allData.length > 0 ? Object.keys(allData[0]) : []);
    
    let updateText = `อัปเดตข้อมูลล่าสุด: ${response.updateDate ? response.updateDate : 'ไม่พบข้อมูล'}`;
    if (response.currentDate && response.currentDate !== '-') {
        updateText += ` | วันนี้วันที่: ${response.currentDate}`;
        globalCurrentDateObj = parseThaiDate(response.currentDate);
    }
    document.getElementById('lastUpdateText').innerText = updateText;
    
    buildMainFilters();
    buildUrgentFilters();
    buildClosingFilters(); 
    buildScoreFilters(); 
    buildPivotFilters();
    
    renderTable();
    renderUrgentTable();
    renderClosingTable();
    renderScoreTable(); 
    renderPivotTable();
    renderDeptStackedChart(); // สร้างกราฟหน่วยงาน 1 ครั้งเมื่อโหลดข้อมูลเสร็จ
    
    showLoading(false);
}

function onDataError(error) {
    alert('เกิดข้อผิดพลาดในการดึงข้อมูล: ' + error);
    showLoading(false);
}

// ==========================================
// ส่วนจัดการ หน้าตารางหลัก (Main View)
// ==========================================
function buildMainFilters() {
    const container = document.getElementById('filtersContainer');
    container.innerHTML = '';

    FILTER_COLUMNS.forEach(colName => {
        if (!sheetHeaders.includes(colName)) return;
        const uniqueValues = [...new Set(allData.map(item => item[colName]))].filter(val => val && val !== '-').sort();

        container.innerHTML += `
            <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">${colName}</label>
                <select id="filter-${colName}" onchange="applyFilters()" class="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white cursor-pointer">
                    <option value="all">-- ทั้งหมด --</option>
                    ${uniqueValues.map(val => `<option value="${val}">${val}</option>`).join('')}
                </select>
            </div>
        `;
    });
}

function resetFilters() {
    const searchInput = document.getElementById('search-carpar');
    if (searchInput) searchInput.value = '';

    FILTER_COLUMNS.forEach(colName => {
        const selectEl = document.getElementById(`filter-${colName}`);
        if (selectEl) selectEl.value = 'all';
    });
    applyFilters();
}

function applyFilters() {
    const searchTerm = document.getElementById('search-carpar') ? document.getElementById('search-carpar').value.trim().toLowerCase() : '';

    filteredData = allData.filter(item => {
        let isMatch = true;
        if (searchTerm !== '') {
            const carparNum = item["เลขที่ CAR/PAR"] ? item["เลขที่ CAR/PAR"].toLowerCase() : '';
            if (!carparNum.includes(searchTerm)) isMatch = false;
        }
        FILTER_COLUMNS.forEach(colName => {
            const selectEl = document.getElementById(`filter-${colName}`);
            if (selectEl && selectEl.value !== 'all' && item[colName] !== selectEl.value) {
                isMatch = false;
            }
        });
        return isMatch;
    });
    renderTable();
}

function renderTable() {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');
    const noData = document.getElementById('noData');
    
    if (thead.innerHTML.trim() === '') {
        thead.innerHTML = sheetHeaders.map(header => `<th class="px-6 py-4 border-b border-gray-200">${header}</th>`).join('');
    }

    if (filteredData.length === 0) {
        tbody.innerHTML = '';
        noData.classList.remove('hidden');
        document.getElementById('recordCount').innerText = `แสดงข้อมูล 0 รายการ`;
        return;
    } else {
        noData.classList.add('hidden');
    }

    tbody.innerHTML = filteredData.map(row => {
        const cellsHtml = sheetHeaders.map(header => {
            let cellValue = row[header] || '-';
            if (header.includes('สถานะ') && cellValue !== '-') {
                return `<td class="px-6 py-3"><span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadgeClass(cellValue)}">${cellValue}</span></td>`;
            }
            if (header === 'เรื่องซ้ำ/ไม่ซ้ำกับปี 2568' && cellValue !== '-') {
                return `<td class="px-6 py-3"><span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getRepeatBadgeClass(cellValue)}">${cellValue}</span></td>`;
            }
            return `<td class="px-6 py-3 text-gray-600">${cellValue}</td>`;
        }).join('');
        return `<tr class="hover:bg-indigo-50/50 transition-colors">${cellsHtml}</tr>`;
    }).join('');

    document.getElementById('recordCount').innerText = `แสดงข้อมูล ${filteredData.length} จากทั้งหมด ${allData.length} รายการ`;
}

// ==========================================
// ส่วนจัดการ หน้างานเร่งด่วนตอบกลับ (Urgent View)
// ==========================================
function buildUrgentFilters() {
    const deptValues = [...new Set(allData.map(i => i[PIVOT_COL_DEPT]))].filter(v => v && v !== '-').sort();
    const deptSelect = document.getElementById('urgent-filter-dept');
    deptSelect.innerHTML = `<option value="all">-- ทั้งหมด --</option>` + deptValues.map(v => `<option value="${v}">${v}</option>`).join('');

    const subDeptValues = [...new Set(allData.map(i => i[PIVOT_COL_SUBDEPT]))].filter(v => v && v !== '-').sort();
    const subDeptSelect = document.getElementById('urgent-filter-subdept');
    subDeptSelect.innerHTML = `<option value="all">-- ทั้งหมด --</option>` + subDeptValues.map(v => `<option value="${v}">${v}</option>`).join('');
}

function resetUrgentFilters() {
    document.getElementById('urgent-filter-dept').value = 'all';
    document.getElementById('urgent-filter-subdept').value = 'all';
    renderUrgentTable();
}

function renderUrgentTable() {
    const tbody = document.getElementById('urgentTableBody');
    const noData = document.getElementById('urgentNoData');
    
    const fDept = document.getElementById('urgent-filter-dept').value;
    const fSubDept = document.getElementById('urgent-filter-subdept').value;

    let urgentData = allData.filter(item => {
        const status = item["สถานะ ตอบกลับเลท/ไม่เลท"] || '';
        const isUrgentTarget = status === "ยังไม่ตอบกลับ (On track)" || status === "ยังไม่ตอบกลับ (Late)";
        
        if (!isUrgentTarget) return false;
        if (fDept !== 'all' && item[PIVOT_COL_DEPT] !== fDept) return false;
        if (fSubDept !== 'all' && item[PIVOT_COL_SUBDEPT] !== fSubDept) return false;
        return true;
    });

    urgentData = urgentData.map(item => {
        let remainingDays = null;
        const dueStr = item["กำหนดตอบกลับ"];
        
        if (dueStr && dueStr !== '-' && globalCurrentDateObj) {
            const dueDateObj = parseThaiDate(dueStr);
            if (dueDateObj) {
                const diffTime = dueDateObj - globalCurrentDateObj;
                remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            }
        }
        return { ...item, _remain: remainingDays }; 
    });

    urgentData.sort((a, b) => {
        if (a._remain === null) return 1; 
        if (b._remain === null) return -1;
        return a._remain - b._remain;
    });

    if (urgentData.length === 0) {
        tbody.innerHTML = '';
        noData.classList.remove('hidden');
        document.getElementById('urgentRecordCount').innerText = `แสดงข้อมูล 0 รายการ`;
        return;
    } else {
        noData.classList.add('hidden');
    }

    const colsToDisplay = [
        "เลขที่ CAR/PAR", "ผู้รับ CAR/PAR (Department)", "ผู้รับ CAR/PAR (Sub-Department)", 
        "ประเภท CAR/PAR", "วันที่รับ", "กำหนดตอบกลับ", "_remain", "สถานะ ตอบกลับเลท/ไม่เลท"
    ];

    tbody.innerHTML = urgentData.map(row => {
        const cellsHtml = colsToDisplay.map(col => {
            if (col === "_remain") {
                let remainVal = row[col];
                if (remainVal === null) return `<td class="px-6 py-3 text-center text-gray-400">-</td>`;
                
                let colorClass = "text-gray-800 font-medium";
                let bgClass = "bg-gray-100";
                if (remainVal < 0) { colorClass = "text-red-700 font-bold"; bgClass = "bg-red-100"; }
                else if (remainVal <= 3) { colorClass = "text-amber-700 font-bold"; bgClass = "bg-amber-100"; }
                else { colorClass = "text-emerald-700 font-medium"; bgClass = "bg-emerald-50"; }
                
                return `<td class="px-6 py-3 text-center"><span class="inline-block px-3 py-1 rounded-md ${bgClass} ${colorClass}">${remainVal}</span></td>`;
            }
            
            let cellValue = row[col] || '-';
            if (col.includes('สถานะ') && cellValue !== '-') {
                return `<td class="px-6 py-3"><span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadgeClass(cellValue)}">${cellValue}</span></td>`;
            }
            
            return `<td class="px-6 py-3 text-gray-700">${cellValue}</td>`;
        }).join('');
        
        return `<tr class="hover:bg-rose-50/50 transition-colors">${cellsHtml}</tr>`;
    }).join('');

    document.getElementById('urgentRecordCount').innerText = `พบงานค้างที่ยังไม่ตอบกลับ ${urgentData.length} รายการ`;
}

// ==========================================
// ส่วนจัดการ หน้างานใกล้กำหนดปิด (Closing View)
// ==========================================
function buildClosingFilters() {
    const deptValues = [...new Set(allData.map(i => i[PIVOT_COL_DEPT]))].filter(v => v && v !== '-').sort();
    const deptSelect = document.getElementById('closing-filter-dept');
    deptSelect.innerHTML = `<option value="all">-- ทั้งหมด --</option>` + deptValues.map(v => `<option value="${v}">${v}</option>`).join('');

    const subDeptValues = [...new Set(allData.map(i => i[PIVOT_COL_SUBDEPT]))].filter(v => v && v !== '-').sort();
    const subDeptSelect = document.getElementById('closing-filter-subdept');
    subDeptSelect.innerHTML = `<option value="all">-- ทั้งหมด --</option>` + subDeptValues.map(v => `<option value="${v}">${v}</option>`).join('');
}

function resetClosingFilters() {
    document.getElementById('closing-filter-dept').value = 'all';
    document.getElementById('closing-filter-subdept').value = 'all';
    renderClosingTable();
}

function renderClosingTable() {
    const tbody = document.getElementById('closingTableBody');
    const noData = document.getElementById('closingNoData');
    
    const fDept = document.getElementById('closing-filter-dept').value;
    const fSubDept = document.getElementById('closing-filter-subdept').value;

    const targetClosingStatuses = [
        "ยังไม่ยื่นปิด (Overdue)",
        "ยังไม่ยื่นปิด (Ondue)",
        "ยังไม่ยื่นปิด (Ondue) @สิ้นปี 2569",
        "ยังไม่ยื่นปิด (Overdue) @สิ้นปี 2569"
    ];

    let closingData = allData.filter(item => {
        const status = item["สถานะยื่นเอกสารปิด CAR/PAR"] ? item["สถานะยื่นเอกสารปิด CAR/PAR"].trim() : '';
        
        if (!targetClosingStatuses.includes(status)) return false;
        if (fDept !== 'all' && item[PIVOT_COL_DEPT] !== fDept) return false;
        if (fSubDept !== 'all' && item[PIVOT_COL_SUBDEPT] !== fSubDept) return false;
        return true;
    });

    closingData = closingData.map(item => {
        let remainingDays = null;
        
        if (globalCurrentDateObj) {
            let targetDateObj = parseThaiDate(item["วันที่คาดว่าจะเสร็จใหม่"]);
            if (!targetDateObj) {
                targetDateObj = parseThaiDate(item["วันที่คาดว่าจะเสร็จ"]);
            }
            if (targetDateObj) {
                const diffTime = targetDateObj - globalCurrentDateObj;
                remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
        }
        
        return { ...item, _remain: remainingDays };
    });

    closingData.sort((a, b) => {
        if (a._remain === null) return 1; 
        if (b._remain === null) return -1;
        return a._remain - b._remain;
    });

    if (closingData.length === 0) {
        tbody.innerHTML = '';
        noData.classList.remove('hidden');
        document.getElementById('closingRecordCount').innerText = `แสดงข้อมูล 0 รายการ`;
        return;
    } else {
        noData.classList.add('hidden');
    }

    const colsToDisplay = [
        "เลขที่ CAR/PAR", "ผู้รับ CAR/PAR (Department)", "ผู้รับ CAR/PAR (Sub-Department)", 
        "วันที่คาดว่าจะเสร็จ", "วันที่ยื่นยืด due (ต้องยื่นก่อนถึงวันที่คาดว่าจะเสร็จเดิม)", "วันที่คาดว่าจะเสร็จใหม่", "_remain", "สถานะยื่นเอกสารปิด CAR/PAR"
    ];

    tbody.innerHTML = closingData.map(row => {
        const cellsHtml = colsToDisplay.map(col => {
            if (col === "_remain") {
                let remainVal = row[col];
                if (remainVal === null) return `<td class="px-6 py-3 text-center text-gray-400">-</td>`;
                
                let colorClass = "text-gray-800 font-medium";
                let bgClass = "bg-gray-100";
                if (remainVal < 0) { colorClass = "text-red-700 font-bold"; bgClass = "bg-red-100"; }
                else if (remainVal <= 3) { colorClass = "text-amber-700 font-bold"; bgClass = "bg-amber-100"; }
                else { colorClass = "text-emerald-700 font-medium"; bgClass = "bg-emerald-50"; }
                
                return `<td class="px-6 py-3 text-center"><span class="inline-block px-3 py-1 rounded-md ${bgClass} ${colorClass}">${remainVal}</span></td>`;
            }
            
            let cellValue = row[col] || '-';
            if (col.includes('สถานะ') && cellValue !== '-') {
                return `<td class="px-6 py-3"><span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadgeClass(cellValue)}">${cellValue}</span></td>`;
            }
            
            return `<td class="px-6 py-3 text-gray-700">${cellValue}</td>`;
        }).join('');
        
        return `<tr class="hover:bg-amber-50/50 transition-colors">${cellsHtml}</tr>`;
    }).join('');

    document.getElementById('closingRecordCount').innerText = `พบงานใกล้กำหนดปิด ${closingData.length} รายการ`;
}

// ==========================================
// ส่วนจัดการ หน้าตรวจเช็คคะแนนประสิทธิภาพ (Score View)
// ==========================================
function buildScoreFilters() {
    const deptValues = [...new Set(allData.map(i => i[PIVOT_COL_DEPT]))].filter(v => v && v !== '-').sort();
    const deptSelect = document.getElementById('score-filter-dept');
    deptSelect.innerHTML = `<option value="all">-- ทั้งหมด --</option>` + deptValues.map(v => `<option value="${v}">${v}</option>`).join('');

    const subDeptValues = [...new Set(allData.map(i => i[PIVOT_COL_SUBDEPT]))].filter(v => v && v !== '-').sort();
    const subDeptSelect = document.getElementById('score-filter-subdept');
    subDeptSelect.innerHTML = `<option value="all">-- ทั้งหมด --</option>` + subDeptValues.map(v => `<option value="${v}">${v}</option>`).join('');

    const scoreValues = [...new Set(allData.map(i => i[SCORE_COL]))].filter(v => v && v !== '-').sort();
    const scoreSelect = document.getElementById('score-filter-score');
    scoreSelect.innerHTML = `<option value="all">-- ทั้งหมด --</option>` + scoreValues.map(v => `<option value="${v}">${v}</option>`).join('');
}

function toggleScoreSort() {
    if (scoreSortDirection === 'none') {
        scoreSortDirection = 'asc'; 
    } else if (scoreSortDirection === 'asc') {
        scoreSortDirection = 'desc'; 
    } else {
        scoreSortDirection = 'none'; 
    }
    
    const iconEl = document.getElementById('scoreSortIcon');
    if (scoreSortDirection === 'asc') {
        iconEl.innerHTML = `<svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>`;
    } else if (scoreSortDirection === 'desc') {
        iconEl.innerHTML = `<svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;
    } else {
        iconEl.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"></path></svg>`;
    }
    
    renderScoreTable();
}

function getScoreValue(scoreStr) {
    if (!scoreStr || scoreStr === '-') return -1;
    const num = parseInt(scoreStr.replace(/[^\d.-]/g, ''), 10);
    return isNaN(num) ? -1 : num;
}

function resetScoreFilters() {
    document.getElementById('score-filter-dept').value = 'all';
    document.getElementById('score-filter-subdept').value = 'all';
    document.getElementById('score-filter-score').value = 'all';
    
    scoreSortDirection = 'none';
    document.getElementById('scoreSortIcon').innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"></path></svg>`;
    
    renderScoreTable();
}

function renderScoreTable() {
    const tbody = document.getElementById('scoreTableBody');
    const noData = document.getElementById('scoreNoData');
    
    const fDept = document.getElementById('score-filter-dept').value;
    const fSubDept = document.getElementById('score-filter-subdept').value;
    const fScore = document.getElementById('score-filter-score').value;

    let scoreData = allData.filter(item => {
        if (fDept !== 'all' && item[PIVOT_COL_DEPT] !== fDept) return false;
        if (fSubDept !== 'all' && item[PIVOT_COL_SUBDEPT] !== fSubDept) return false;
        if (fScore !== 'all' && item[SCORE_COL] !== fScore) return false;
        return true;
    });

    if (scoreSortDirection !== 'none') {
        scoreData.sort((a, b) => {
            const valA = getScoreValue(a[SCORE_COL]);
            const valB = getScoreValue(b[SCORE_COL]);
            if (scoreSortDirection === 'asc') {
                return valA - valB; 
            } else {
                return valB - valA; 
            }
        });
    }

    if (scoreData.length === 0) {
        tbody.innerHTML = '';
        noData.classList.remove('hidden');
        document.getElementById('scoreRecordCount').innerText = `แสดงข้อมูล 0 รายการ`;
        return;
    } else {
        noData.classList.add('hidden');
    }

    const colsToDisplay = [
        "เลขที่ CAR/PAR",
        "%คะแนน การปิด CAR อย่างมีประสิทธิภาพ",
        "เรื่องซ้ำ/ไม่ซ้ำกับปี 2568",
        "สถานะ ตอบกลับเลท/ไม่เลท",
        "สถานะยื่นเอกสารปิด CAR/PAR",
        "สถานะ แก้ไขเลท/ไม่เลทจากที่กำหนดเสร็จ",
        "สถานะ แก้ไขเลท/ไม่เลทจากที่กำหนดเสร็จของยื่นยืด due ใหม่",
        "หมายเหตุ"
    ];

    tbody.innerHTML = scoreData.map(row => {
        const cellsHtml = colsToDisplay.map(col => {
            let cellValue = row[col] || '-';
            
            if (col === "%คะแนน การปิด CAR อย่างมีประสิทธิภาพ" && cellValue !== '-') {
                return `<td class="px-6 py-3 font-semibold text-blue-700">${cellValue}</td>`;
            }
            
            if (col.includes('สถานะ') && cellValue !== '-') {
                return `<td class="px-6 py-3"><span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadgeClass(cellValue)}">${cellValue}</span></td>`;
            }
            
            if (col === 'เรื่องซ้ำ/ไม่ซ้ำกับปี 2568' && cellValue !== '-') {
                return `<td class="px-6 py-3"><span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getRepeatBadgeClass(cellValue)}">${cellValue}</span></td>`;
            }
            
            return `<td class="px-6 py-3 text-gray-700">${cellValue}</td>`;
        }).join('');
        
        return `<tr class="hover:bg-blue-50/50 transition-colors">${cellsHtml}</tr>`;
    }).join('');

    document.getElementById('scoreRecordCount').innerText = `แสดงข้อมูล ${scoreData.length} จากทั้งหมด ${allData.length} รายการ`;
}

// ==========================================
// ส่วนจัดการ หน้าสถิติ (Pivot View) 
// ==========================================
function buildPivotFilters() {
    const deptValues = [...new Set(allData.map(i => i[PIVOT_COL_DEPT]))].filter(v => v && v !== '-').sort();
    const deptSelect = document.getElementById('pivot-filter-dept');
    deptSelect.innerHTML = `<option value="all">-- ทั้งหมด --</option>` + deptValues.map(v => `<option value="${v}">${v}</option>`).join('');

    const subDeptValues = [...new Set(allData.map(i => i[PIVOT_COL_SUBDEPT]))].filter(v => v && v !== '-').sort();
    const subDeptSelect = document.getElementById('pivot-filter-subdept');
    subDeptSelect.innerHTML = `<option value="all">-- ทั้งหมด --</option>` + subDeptValues.map(v => `<option value="${v}">${v}</option>`).join('');
}

function renderPivotTable() {
    const table = document.getElementById('pivotTableContainer');
    const noData = document.getElementById('pivotNoData');
    
    const fDept = document.getElementById('pivot-filter-dept').value;
    const fSubDept = document.getElementById('pivot-filter-subdept').value;
    
    let displayDept = fDept === 'all' ? 'ทั้งหมด' : fDept;
    let displaySubDept = fSubDept === 'all' ? 'ทั้งหมด' : fSubDept;
    let filterStatusText = `ฝ่าย: ${displayDept} | แผนก: ${displaySubDept}`;
    
    let cumStatus = document.getElementById('cumulativeFilterStatus');
    if(cumStatus) cumStatus.innerText = filterStatusText;
    
    let sunStatus = document.getElementById('sunburstFilterStatus');
    if(sunStatus) sunStatus.innerText = filterStatusText;

    let currentMonthKey = "9999-99";
    if (globalCurrentDateObj) {
        let y = globalCurrentDateObj.getFullYear();
        let m = String(globalCurrentDateObj.getMonth() + 1).padStart(2, '0');
        currentMonthKey = `${y}-${m}`;
    }

    let pData = allData.filter(item => {
        let match = true;
        if (fDept !== 'all' && item[PIVOT_COL_DEPT] !== fDept) match = false;
        if (fSubDept !== 'all' && item[PIVOT_COL_SUBDEPT] !== fSubDept) match = false;
        return match;
    });

    renderCumulativeData(pData);
    renderSunburstChart(pData);

    if (pData.length === 0) {
        table.innerHTML = '';
        noData.classList.remove('hidden');
        return;
    } else {
        noData.classList.add('hidden');
    }

    const uniqueCols = [...new Set(pData.map(d => d[PIVOT_COL_REPLY_STATUS]))].filter(v => v && v !== '-').sort();
    let hierarchy = {};
    
    pData.forEach(row => {
        let r1 = row[PIVOT_ROW1] || '(ไม่มีสถานะ)';
        let r2 = row[PIVOT_ROW2] || '(ไม่มีเลขที่)';
        let type = row["ประเภท CAR/PAR"] || '-'; 
        let col = row[PIVOT_COL_REPLY_STATUS] || '(ไม่มีสถานะ)';
        
        let valToCount = row[PIVOT_VALUE];
        if (valToCount && valToCount.trim() !== '') {
            if (!hierarchy[r1]) hierarchy[r1] = {};
            if (!hierarchy[r1][r2]) hierarchy[r1][r2] = { type: type, data: {} };
            if (!hierarchy[r1][r2].data[col]) hierarchy[r1][r2].data[col] = 0;
            hierarchy[r1][r2].data[col] += 1;
        }
    });

    let theadHtml = `
        <thead>
            <tr>
                <th class="w-1/4">${PIVOT_ROW1}</th>
                <th class="w-1/6">${PIVOT_ROW2}</th>
                <th class="w-1/6">ประเภท CAR/PAR</th>
                ${uniqueCols.map(c => `<th>${c}</th>`).join('')}
                <th class="bg-indigo-100">รวม</th>
            </tr>
        </thead>
    `;

    let tbodyHtml = `<tbody>`;
    let colTotals = {};
    uniqueCols.forEach(c => colTotals[c] = 0);
    let absoluteGrandTotal = 0;

    const r1Keys = Object.keys(hierarchy).sort();
    
    if(r1Keys.length === 0) {
         table.innerHTML = `<tr><td class="text-center p-4">ไม่มีข้อมูลที่ตรงกับเงื่อนไขการนับ</td></tr>`;
         return;
    }

    r1Keys.forEach(r1 => {
        const r2Keys = Object.keys(hierarchy[r1]).sort();
        
        let r1Total = 0;
        r2Keys.forEach(r2 => {
            uniqueCols.forEach(c => {
                r1Total += hierarchy[r1][r2].data[c] || 0;
            });
        });
        
        r2Keys.forEach((r2, index) => {
            tbodyHtml += `<tr class="hover:bg-gray-50 transition-colors">`;
            
            if (index === 0) {
                tbodyHtml += `<td rowspan="${r2Keys.length}" class="font-semibold bg-gray-50 border-r align-top">${r1}</td>`;
            }
            
            tbodyHtml += `<td class="border-r font-medium text-indigo-700">${r2}</td>`;
            tbodyHtml += `<td class="border-r text-center">${hierarchy[r1][r2].type}</td>`; 
            
            let rowTotal = 0;
            uniqueCols.forEach(c => {
                let val = hierarchy[r1][r2].data[c] || 0;
                rowTotal += val;
                colTotals[c] += val;
                tbodyHtml += `<td class="text-center">${val > 0 ? val : '<span class="text-gray-300">-</span>'}</td>`;
            });

            absoluteGrandTotal += rowTotal;
            
            if (index === 0) {
                tbodyHtml += `<td rowspan="${r2Keys.length}" class="text-center font-bold bg-indigo-50 border-l border-gray-200 align-middle text-indigo-900 text-base">${r1Total}</td>`;
            }
            
            tbodyHtml += `</tr>`;
        });
    });
    tbodyHtml += `</tbody>`;

    let tfootHtml = `
        <tfoot>
            <tr class="bg-indigo-600 text-white font-bold text-base">
                <td colspan="3" class="text-right px-4 py-3 border-r border-indigo-500">รวมทั้งหมด</td>
                ${uniqueCols.map(c => `<td class="text-center px-4 py-3 border-r border-indigo-500">${colTotals[c]}</td>`).join('')}
                <td class="text-center px-4 py-3">${absoluteGrandTotal}</td>
            </tr>
        </tfoot>
    `;

    table.innerHTML = theadHtml + tbodyHtml + tfootHtml;
}

// ==========================================
// ฟังก์ชันสร้างกลุ่ม "แหล่งที่มา" อิงจากตัวอักษรหน้าเลขที่ CAR/PAR
// ==========================================
function getSourceGroup(carparStr) {
    if (!carparStr || carparStr.trim() === '-' || carparStr.trim() === '') return 'Other';
    const firstLetter = carparStr.trim().charAt(0).toUpperCase();
    if (firstLetter === 'I') return 'Internal';
    if (firstLetter === 'E') return 'External';
    if (firstLetter === 'C') return 'Complain';
    if (firstLetter === 'O') return 'Other';
    return 'Other'; 
}

// ==========================================
// ฟังก์ชันสำหรับวาดกราฟวงแหวน Sunburst (Plotly.js)
// ==========================================
function renderSunburstChart(filteredPivotData) {
    let hierarchyMap = {};

    filteredPivotData.forEach(row => {
        let carpar = row["เลขที่ CAR/PAR"] || "";
        let source = getSourceGroup(carpar);
        let type = row["ประเภท CAR/PAR"] || "ไม่ระบุประเภท";
        let status = row["สถานะยื่นเอกสารปิด CAR/PAR"] ? row["สถานะยื่นเอกสารปิด CAR/PAR"].trim() : "ไม่มีสถานะ";

        if (type === '-') type = "ไม่ระบุประเภท";

        hierarchyMap[source] = (hierarchyMap[source] || 0) + 1;
        
        let idLevel2 = `${source}|${type}`;
        hierarchyMap[idLevel2] = (hierarchyMap[idLevel2] || 0) + 1;

        if (status === "ยื่นปิดแล้ว") {
            let idLevel3 = `${source}|${type}|${status}`;
            hierarchyMap[idLevel3] = (hierarchyMap[idLevel3] || 0) + 1;
        }
    });

    let ids = [];
    let labels = [];
    let parents = [];
    let values = [];

    for (let key in hierarchyMap) {
        let parts = key.split('|');
        if (parts.length === 1) {
            ids.push(key);
            labels.push(parts[0]);
            parents.push(""); 
            values.push(hierarchyMap[key]);
        } else if (parts.length === 2) {
            ids.push(key);
            labels.push(parts[1]);
            parents.push(parts[0]);
            values.push(hierarchyMap[key]);
        } else if (parts.length === 3) {
            ids.push(key);
            labels.push(parts[2]);
            parents.push(`${parts[0]}|${parts[1]}`);
            values.push(hierarchyMap[key]);
        }
    }

    var data = [{
        type: "sunburst",
        ids: ids,
        labels: labels,
        parents: parents,
        values: values,
        outsidetextfont: {size: 14, color: "#374151"},
        leaf: {opacity: 0.8},
        marker: {line: {width: 1, color: 'white'}},
        branchvalues: 'total', 
        texttemplate: '%{label}<br><b>%{value}</b>',
        hovertemplate: '<b>%{label}</b><br>จำนวน: %{value}<br>คิดเป็น: %{percentParent:.1%} ของ %{parent}<extra></extra>'
    }];

    var layout = {
        margin: {l: 10, r: 10, b: 10, t: 10},
        sunburstcolorway:["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"],
        font: { family: "'Noto Sans Thai', sans-serif" }
    };

    Plotly.newPlot('sunburstChart', data, layout, {responsive: true, displayModeBar: false});
}

// ==========================================
// ฟังก์ชันสร้างตารางสถิติสะสมรายเดือนและวาดกราฟแท่ง
// ==========================================
function renderCumulativeData(filteredPivotData) {
    let monthCounts = {};
    
    filteredPivotData.forEach(row => {
        let recvDate = parseThaiDate(row['วันที่รับ']);
        if (recvDate) {
            let mKey = recvDate.getFullYear() + '-' + String(recvDate.getMonth() + 1).padStart(2, '0');
            if (!monthCounts[mKey]) monthCounts[mKey] = { recv: 0, closed: 0 };
            monthCounts[mKey].recv++;
        }
        
        let closeDate = parseThaiDate(row['วันที่ปิดเอกสาร']); 
        if (closeDate) {
            let mKey = closeDate.getFullYear() + '-' + String(closeDate.getMonth() + 1).padStart(2, '0');
            if (!monthCounts[mKey]) monthCounts[mKey] = { recv: 0, closed: 0 };
            monthCounts[mKey].closed++;
        }
    });

    let runningRecv = 0;
    let runningClosed = 0;
    let cumulativeByMonth = {};
    
    for (let y = 2020; y <= 2027; y++) {
        for (let m = 1; m <= 12; m++) {
            let k = y + '-' + String(m).padStart(2, '0');
            if (monthCounts[k]) {
                runningRecv += monthCounts[k].recv;
                runningClosed += monthCounts[k].closed;
            }
            cumulativeByMonth[k] = { recv: runningRecv, closed: runningClosed };
            
            if (y === 2027 && m === 3) break; 
        }
    }

    let cutoffKey = "9999-99";
    if (globalCurrentDateObj) {
        let y = globalCurrentDateObj.getFullYear();
        let m = String(globalCurrentDateObj.getMonth() + 1).padStart(2, '0');
        cutoffKey = `${y}-${m}`;
    }

    const allDisplayMonths = [
        { key: '2026-05', label: 'พ.ค. 2026' },
        { key: '2026-06', label: 'มิ.ย. 2026' },
        { key: '2026-07', label: 'ก.ค. 2026' },
        { key: '2026-08', label: 'ส.ค. 2026' },
        { key: '2026-09', label: 'ก.ย. 2026' },
        { key: '2026-10', label: 'ต.ค. 2026' },
        { key: '2026-11', label: 'พ.ย. 2026' },
        { key: '2026-12', label: 'ธ.ค. 2026' },
        { key: '2027-01', label: 'ม.ค. 2027' },
        { key: '2027-02', label: 'ก.พ. 2027' },
        { key: '2027-03', label: 'มี.ค. 2027' }
    ];
    
    const displayMonths = allDisplayMonths.filter(m => m.key <= cutoffKey);

    let tbodyHtml2 = '';
    let chartLabels = [];
    let chartDataTotal = [];
    let chartDataClosed = [];

    displayMonths.forEach(m => {
        let vals = cumulativeByMonth[m.key] || {recv: 0, closed: 0};
        
        tbodyHtml2 += `
            <tr class="hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
                <td class="font-medium text-gray-700 text-center py-2">${m.label}</td>
                <td class="text-center text-indigo-700 font-semibold bg-indigo-50/50 py-2">${vals.recv}</td>
                <td class="text-center text-emerald-700 font-semibold bg-emerald-50/50 py-2">${vals.closed}</td>
            </tr>
        `;
        
        chartLabels.push(m.label);
        chartDataTotal.push(vals.recv);
        chartDataClosed.push(vals.closed);
    });
    
    const cBody = document.getElementById('cumulativeTableBody');
    if(cBody) cBody.innerHTML = tbodyHtml2;

    renderChart(chartLabels, chartDataTotal, chartDataClosed);
}

// ฟังก์ชันสำหรับวาดกราฟแท่ง (Chart.js)
function renderChart(labels, dataTotal, dataClosed) {
    const ctx = document.getElementById('cumulativeChart');
    if (!ctx) return;

    if (cumulativeChartInstance) {
        cumulativeChartInstance.destroy();
    }

    const maxTotal = Math.max(...dataTotal, 0);
    const maxAxis = maxTotal > 0 ? Math.ceil(maxTotal * 1.1) : 10; 

    cumulativeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'จำนวน CAR/PAR สะสม (ยังไม่ปิด + ปิดแล้ว)',
                    data: dataTotal,
                    backgroundColor: 'rgba(79, 70, 229, 0.4)', 
                    borderColor: 'rgb(79, 70, 229)',
                    borderWidth: 1,
                    yAxisID: 'y',
                    stack: 'Stack 0' 
                },
                {
                    label: 'จำนวน CAR/PAR ที่ปิดแล้วสะสม',
                    data: dataClosed,
                    backgroundColor: 'rgba(16, 185, 129, 0.9)', 
                    borderColor: 'rgb(16, 185, 129)',
                    borderWidth: 1,
                    yAxisID: 'y1',
                    stack: 'Stack 0'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { stacked: true },
                y: {
                    type: 'linear', display: true, position: 'left', min: 0, max: maxAxis,
                    title: { display: true, text: 'จำนวนสะสม', color: 'rgb(79, 70, 229)', font: { weight: 'bold' } }
                },
                y1: {
                    type: 'linear', display: true, position: 'right', min: 0, max: maxAxis,
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'ปิดแล้วสะสม', color: 'rgb(16, 185, 129)', font: { weight: 'bold' } }
                }
            },
            plugins: { tooltip: { shared: true } }
        }
    });
}

// ==========================================
// ฟังก์ชันสำหรับกราฟ Stacked Bar แบ่งตามหน่วยงาน
// ==========================================
function goBackDeptView() {
    currentDeptView = null;
    document.getElementById('btnBackDept').classList.add('hidden');
    document.getElementById('deptChartSubTitle').innerText = 'แบ่งตามสถานะยื่นเอกสารปิด CAR/PAR (สามารถคลิกที่แท่งกราฟเพื่อดูแผนกย่อย)';
    renderDeptStackedChart();
}

function renderDeptStackedChart() {
    const ctx = document.getElementById('deptStackedChart');
    if (!ctx) return;

    let dataToProcess = allData;
    let groupByCol = currentDeptView === null ? "ผู้รับ CAR/PAR (Department)" : "ผู้รับ CAR/PAR (Sub-Department)";

    if (currentDeptView !== null) {
        dataToProcess = allData.filter(d => d["ผู้รับ CAR/PAR (Department)"] === currentDeptView);
    }

    let xLabelsSet = new Set();
    dataToProcess.forEach(d => {
        let val = d[groupByCol] || "-";
        xLabelsSet.add(val);
    });
    let xLabels = Array.from(xLabelsSet).sort();

    let datasets = STACK_STATUSES.map(status => {
        return {
            label: status,
            data: Array(xLabels.length).fill(0),
            backgroundColor: STACK_COLORS[status],
            stack: 'Stack 0'
        };
    });

    dataToProcess.forEach(d => {
        let xVal = d[groupByCol] || "-";
        let xIndex = xLabels.indexOf(xVal);
        let status = d["สถานะยื่นเอกสารปิด CAR/PAR"] ? d["สถานะยื่นเอกสารปิด CAR/PAR"].trim() : "";
        
        let statusIndex = STACK_STATUSES.indexOf(status);
        if (statusIndex !== -1) {
            datasets[statusIndex].data[xIndex] += 1;
        }
    });

    if (deptStackedChartInstance) {
        deptStackedChartInstance.destroy();
    }

    deptStackedChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: xLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true },
                y: { 
                    stacked: true,
                    title: { display: true, text: 'จำนวนข้อ', font: { weight: 'bold' } }
                }
            },
            plugins: {
                tooltip: { mode: 'index', intersect: false },
                legend: { position: 'bottom' }
            },
            onClick: (e, elements) => {
                if (currentDeptView === null && elements.length > 0) {
                    const index = elements[0].index;
                    const clickedDept = xLabels[index];
                    if (clickedDept && clickedDept !== '-') {
                        currentDeptView = clickedDept;
                        document.getElementById('btnBackDept').classList.remove('hidden');
                        document.getElementById('deptChartSubTitle').innerText = `กำลังแสดงข้อมูลแผนกย่อยของ: ${clickedDept}`;
                        renderDeptStackedChart();
                    }
                }
            }
        }
    });
}

// ==========================================
// Helpers จัดการสีของตาราง
// ==========================================
function getRepeatBadgeClass(val) {
    const cleanVal = val.trim();
    if (cleanVal === 'โปรดตรวจสอบด้วยตัวเอง') return 'bg-orange-50 text-orange-600 border-orange-200';
    if (cleanVal === 'ซ้ำ') return 'bg-red-50 text-red-700 border-red-200';
    if (cleanVal === 'ไม่ซ้ำ') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-gray-50 text-gray-600 border-gray-200';
}

function getStatusBadgeClass(status) {
    const cleanStatus = status.trim();
    
    if (cleanStatus === 'ยังไม่ตอบกลับ (On track)') return 'bg-orange-50 text-orange-600 border-orange-200'; 
    if (cleanStatus === 'ตอบกลับเลท') return 'bg-[#fdf8f5] text-[#8b4513] border-[#d2a679]'; 
    if (cleanStatus === 'ปิดเสร็จตามกำหนด 2569') return 'bg-emerald-50 text-emerald-700 border-emerald-200'; 
    if (cleanStatus === 'ปิดเลท จากกำหนด แต่ยังอยู่ในปี 2569') return 'bg-[#fdf8f5] text-[#8b4513] border-[#d2a679]'; 

    const txt = cleanStatus.toLowerCase();
    if (txt.includes('เลท') || txt.includes('overdue') || txt.includes('late')) return 'bg-red-50 text-red-700 border-red-200';
    if (txt.includes('ในวันที่กำหนด') || txt.includes('on time') || txt.includes('ปิดแล้ว') || txt.includes('เสร็จจริง')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (txt.includes('ยังไม่') || txt.includes('รอ') || txt.includes('ยืด due')) return 'bg-amber-50 text-amber-700 border-amber-200';
    
    return 'bg-gray-50 text-gray-600 border-gray-200';
}

function showLoading(show) {
    const loader = document.getElementById('loading');
    if (loader) {
        if (show) loader.classList.remove('hidden');
        else loader.classList.add('hidden');
    }
}
