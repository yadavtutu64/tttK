/**
 * CDS Study Web - Application Controller
 * Premium Defence Services Education Platform
 * 
 * Features:
 * - Dynamic single-page navigation without full-page reloads
 * - High-speed search filtering for Courses, Subjects, and Content
 * - Robust error handling, automatic schema parsing, and data mappers
 * - Polished UI states (skeletons, glass empty states, responsive video players)
 * - Persisted dark/light theme options via localStorage
 */

// ==========================================
// 1. APPLICATION STATE
// ==========================================
const state = {
  theme: 'light',
  currentScreen: 'home', // 'home' | 'subjects' | 'content'
  courses: [],           // All batches cached
  subjects: [],          // Active course subjects cached
  content: null,         // Active subject content cached
  activeFilter: 'all',   // Course filter: 'all' | 'premium' | 'free'
  searchQuery: '',       // Query typed in global search
  selectedCourse: null,  // { id, name, description }
  selectedSubject: null, // { id, name, teacher }
  activeTab: 'all',      // Content tab filter: 'all' | 'videos' | 'pdfs' | 'assignments' | 'tests'
  newApiBatchData: null  // Cached data for new API batches
};

const PROXY_API = "/api";

// ==========================================
// 2. INITIALIZATION & LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEventListeners();
  handleRouting();
});

function setupEventListeners() {
  // Handle Browser Back/Forward and Routing
  window.addEventListener('hashchange', handleRouting);
  // Global search input handling
  const searchInput = document.getElementById('global-search');
  const searchClear = document.getElementById('search-clear');
  
  searchInput.addEventListener('input', (e) => {
    handleSearch(e.target.value);
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    handleSearch('');
    searchInput.focus();
  });

  // Theme button click
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Home screen course filter buttons
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      filterBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      setCourseFilter(e.target.dataset.filter);
    });
  });

  // Breadcrumb back buttons
  document.getElementById('nav-back-btn').addEventListener('click', handleBackNavigation);

  // Scroll to Top button
  const scrollTopBtn = document.getElementById('scroll-to-top');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
      scrollTopBtn.classList.remove('hidden');
    } else {
      scrollTopBtn.classList.add('hidden');
    }
  });
  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Content screen sidebar tabs click handler
  const tabItems = document.querySelectorAll('.tab-item');
  tabItems.forEach(tab => {
    tab.addEventListener('click', (e) => {
      const tabButton = e.currentTarget;
      tabItems.forEach(t => t.classList.remove('active'));
      tabButton.classList.add('active');
      setContentTab(tabButton.dataset.tab);
    });
  });

  // Modal close trigger
  document.getElementById('modal-close').addEventListener('click', closeVideoPlayer);
  document.getElementById('video-modal').addEventListener('click', (e) => {
    if (e.target.id === 'video-modal') {
      closeVideoPlayer();
    }
  });
}

// ==========================================
// 3. CORE SERVICE LOADERS (API FETCHERS)
// ==========================================

/**
 * GET /all-batches
 * Fetches and displays all available courses/batches.
 */
async function loadCourses() {
  showScreen('home');
  showLoader('courses-grid', 'course', 6);
  
  try {
    // Fetch from both APIs
    const [oldRes, newRes] = await Promise.allSettled([
      fetch(`${PROXY_API}/batches_old`),
      fetch(`${PROXY_API}/batches_new`)
    ]);

    let oldCourses = [];
    if (oldRes.status === 'fulfilled' && oldRes.value.ok) {
      const json = await oldRes.value.json();
      oldCourses = parseCoursesResponse(json);
    }

    let newCourses = [];
    if (newRes.status === 'fulfilled' && newRes.value.ok) {
      const json = await newRes.value.json();
      newCourses = parseNewCoursesResponse(json);
    }

    state.courses = [...oldCourses, ...newCourses];

    if (state.courses.length === 0) {
      showEmpty('No Course Found', 'There are currently no training batches listed. Please check back later.');
    } else {
      renderCourses();
    }
  } catch (err) {
    console.error("Error loading courses:", err);
    showError("Failed to fetch academic batches. Let's try reconnecting.", loadCourses);
  }
}

/**
 * GET /subjects/:courseId
 * Fetches subjects for the selected course card.
 */
async function loadSubjects(courseId) {
  showScreen('subjects');
  showLoader('subjects-grid', 'subject', 4);

  // Handle New API batches
  if (courseId.startsWith('new_')) {
    const rawId = courseId.replace('new_', '');
    try {
      const response = await fetch(`${PROXY_API}/batch_detail/${rawId}`);
      if (!response.ok) throw new Error("New API error");
      const json = await response.json();

      if (json.success && json.data) {
        state.newApiBatchData = json.data;
        state.subjects = json.data.subjects.map((subName, index) => ({
          id: `new_sub_${index}`,
          name: subName,
          image: '',
          teacher: 'Expert Faculty',
          numberOfClasses: json.data.videos_by_subject[subName]?.length || 0,
          contentId: subName // Subject name as content identifier
        }));

        // Update header UI
        document.getElementById('current-course-title').textContent = json.data.batch_name;
        document.getElementById('current-course-subject-count').textContent = state.subjects.length;

        renderSubjects();
      } else {
        showEmpty('Batch Unavailable', 'Could not load details for this new batch.');
      }
    } catch (err) {
      console.error("Error loading new batch subjects:", err);
      showError("Failed to load new batch syllabus.", () => loadSubjects(courseId));
    }
    return;
  }

  // Handle Default API batches
  try {
    const response = await fetch(`${PROXY_API}/subjects/${courseId}`);
    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }
    const json = await response.json();
    
    // Parse response defensively
    state.subjects = parseSubjectsResponse(json, courseId);

    if (state.subjects.length === 0) {
      showEmpty('No Subjects Found', 'This course does not have any assigned syllabus subjects yet.', 'Return to Batches', goHome);
    } else {
      renderSubjects();
    }
  } catch (err) {
    console.error(`Error loading subjects for course ${courseId}:`, err);
    showError("We encountered a loading error while requesting course subjects.", () => loadSubjects(courseId));
  }
}

/**
 * GET /subject/content/:contentId
 * Fetches the specific study material for a selected subject.
 */
async function loadContent(contentId) {
  showScreen('content');
  showLoader('content-items-container', 'material', 5);

  // Decode contentId as it might contain encoded spaces/characters from the URL hash
  const decodedContentId = decodeURIComponent(contentId);

  // Handle New API batches (data is already cached in state.newApiBatchData)
  if (state.selectedCourse?.id?.startsWith('new_') && state.newApiBatchData) {
    const subName = decodedContentId;
    const videos = state.newApiBatchData.videos_by_subject[subName] || [];

    // Format to standard state.content structure
    state.content = {
      chapterName: subName,
      topicName: state.newApiBatchData.batch_name,
      videos: videos.map(v => ({
        id: v.index,
        title: v.title,
        url: v.url,
        duration: 'Class Recording',
        thumbnail: ''
      })),
      pdfs: [],
      assignments: [],
      tests: []
    };

    updateTabBadges();
    renderContent();
    return;
  }

  try {
    const response = await fetch(`${PROXY_API}/content/${contentId}`);
    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }
    const json = await response.json();

    // Parse response defensively
    state.content = parseContentResponse(json);

    // Update tab count badges in sidebar
    updateTabBadges();
    
    // Render the workspace content
    renderContent();
  } catch (err) {
    console.error(`Error loading content for ID ${contentId}:`, err);
    showError("Could not retrieve study materials for this subject.", () => loadContent(contentId));
  }
}

// ==========================================
// 4. DEFENSIVE DATA PARSERS (API COMPATIBILITY MAPPERS)
// ==========================================

function parseCoursesResponse(json) {
  let list = [];
  if (Array.isArray(json)) {
    list = json;
  } else if (json && Array.isArray(json.batches)) {
    list = json.batches;
  } else if (json && Array.isArray(json.data)) {
    list = json.data;
  } else if (json && Array.isArray(json.courses)) {
    list = json.courses;
  } else if (json && typeof json === 'object') {
    // Traverse keys looking for any array
    for (const key in json) {
      if (Array.isArray(json[key])) {
        list = json[key];
        break;
      }
    }
  }

  return list.map((item, index) => {
    // Generate static details or map API tags
    const id = item.id || item.courseId || item._id || item.batchId || `course_${index}`;
    const name = item.courseName || item.name || item.title || item.batchName || 'Untitled Course';
    const description = item.courseDescription || item.description || item.desc || item.batchDescription || 'A comprehensive general syllabus track designed for Defence Services excellence.';
    const image = item.courseImage || item.image || item.imageUrl || item.img || item.thumbnail || '';
    const totalSubjects = parseInt(item.totalSubjects || item.subjectsCount || (item.subjects && item.subjects.length) || 0);

    // Assign type fallback to enable working premium/free mock filter
    const isPremium = item.isPremium !== undefined ? item.isPremium : (index % 3 !== 0);
    const filterType = isPremium ? 'premium' : 'free';

    return { id, name, description, image, totalSubjects, filterType };
  });
}

function parseNewCoursesResponse(json) {
  // Defensive check for various list locations in the response
  let list = [];
  if (Array.isArray(json)) {
    list = json;
  } else if (json && Array.isArray(json.data)) {
    list = json.data;
  } else if (json && Array.isArray(json.batches)) {
    list = json.batches;
  } else if (json && typeof json === 'object') {
    for (const key in json) {
      if (Array.isArray(json[key])) {
        list = json[key];
        break;
      }
    }
  }

  console.log("Parsed New API List:", list); // Diagnostic Log

  return list.map(item => ({
    id: `new_${item.id || item.batch_id || Math.random().toString(36).substr(2, 9)}`,
    name: item.name || item.courseName || item.batch_name || 'Untitled Batch',
    description: `Premium Course - ${item.price || 'Free access'}. Complete syllabus coverage with expert guidance for CDS preparation.`,
    image: item.thumbnail || item.image || item.courseImage || '',
    totalSubjects: item.total_subjects || item.subjectsCount || 0,
    filterType: 'new-batches',
    isNewApi: true,
    rawId: item.id || item.batch_id
  }));
}

function parseSubjectsResponse(json, courseId) {
  let list = [];
  if (Array.isArray(json)) {
    list = json;
  } else if (json && Array.isArray(json.subjects)) {
    list = json.subjects;
  } else if (json && Array.isArray(json.data)) {
    list = json.data;
  } else if (json && typeof json === 'object') {
    for (const key in json) {
      if (Array.isArray(json[key])) {
        list = json[key];
        break;
      }
    }
  }

  return list.map((item, index) => {
    const id = item.id || item.subjectId || item._id || `subject_${index}`;
    const name = item.subjectName || item.name || item.title || 'General Studies';
    const image = item.subjectImage || item.image || item.imageUrl || item.thumbnail || '';
    const teacher = item.teacher || item.teacherName || item.instructor || 'Expert Faculty';
    const numberOfClasses = parseInt(item.numberOfClasses || item.classes || item.totalClasses || item.classCount || 0);
    
    // Construct proper contentId structure for API matching (e.g. courseId_subjectShortName)
    // The example provided was content/3e4c5cb1_maths
    let contentId = item.contentId || item.id || '';
    if (!contentId || contentId === id) {
      const formattedName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      contentId = `${courseId}_${formattedName}`;
    }

    return { id, name, image, teacher, numberOfClasses, contentId };
  });
}

function parseContentResponse(json) {
  // Use subject and course from API as fallbacks for chapter and topic names
  const chapterName = json?.chapterName || json?.chapter || json?.chapter_name || json?.subject || 'Course Syllabus';
  const topicName = json?.topicName || json?.topic || json?.topic_name || json?.course || 'Subject Materials';
  
  // Extract lists defensively
  let rawVideos = [];
  if (Array.isArray(json?.videos)) rawVideos = json.videos;
  else if (Array.isArray(json?.videoClasses)) rawVideos = json.videoClasses;
  else if (Array.isArray(json?.videoList)) rawVideos = json.videoList;
  else if (Array.isArray(json?.video)) rawVideos = json.video;
  else if (Array.isArray(json?.data)) rawVideos = json.data;

  let rawPdfs = [];
  if (Array.isArray(json?.pdfs)) rawPdfs = json.pdfs;
  else if (Array.isArray(json?.pdfNotes)) rawPdfs = json.pdfNotes;
  else if (Array.isArray(json?.notes)) rawPdfs = json.notes;
  else if (Array.isArray(json?.pdf)) rawPdfs = json.pdf;

  let rawAssignments = [];
  if (Array.isArray(json?.assignments)) rawAssignments = json.assignments;
  else if (Array.isArray(json?.assignmentList)) rawAssignments = json.assignmentList;
  else if (Array.isArray(json?.assignment)) rawAssignments = json.assignment;

  let rawTests = [];
  if (Array.isArray(json?.tests)) rawTests = json.tests;
  else if (Array.isArray(json?.testList)) rawTests = json.testList;
  else if (Array.isArray(json?.test)) rawTests = json.test;

  // Standardize formats
  const videos = rawVideos.map((v, i) => ({
    id: v.id || v._id || v.index || `v_${i}`,
    title: v.title || v.name || v.videoTitle || `Lecture Video ${i + 1}`,
    url: v.url || v.videoUrl || v.link || v.videoLink || '#',
    duration: v.duration || v.length || v.time || 'Class Recording',
    thumbnail: v.thumbnail || v.image || v.imageUrl || ''
  }));

  const pdfs = rawPdfs.map((p, i) => ({
    id: p.id || p._id || `p_${i}`,
    title: p.title || p.name || p.pdfName || `Study Notes PDF ${i + 1}`,
    url: p.url || p.pdfUrl || p.link || '#',
    size: p.size || p.fileSize || p.pdfSize || '2.4 MB'
  }));

  const assignments = rawAssignments.map((a, i) => ({
    id: a.id || a._id || `a_${i}`,
    title: a.title || a.name || a.assignmentName || `Daily Practice Sheet ${i + 1}`,
    url: a.url || a.link || '#',
    dueDate: a.dueDate || a.due || 'Open practice sheet'
  }));

  const tests = rawTests.map((t, i) => ({
    id: t.id || t._id || `t_${i}`,
    title: t.title || t.name || t.testName || `Interactive Quiz ${i + 1}`,
    url: t.url || t.link || '#',
    duration: t.duration || t.time || '20 Mins',
    questions: t.questions || t.totalQuestions || '15 MCQ Exams'
  }));

  return { chapterName, topicName, videos, pdfs, assignments, tests };
}

// ==========================================
// 5. VIEW RENDERING ENGINE
// ==========================================

/**
 * Render home batches grid
 */
function renderCourses() {
  const grid = document.getElementById('courses-grid');
  grid.classList.remove('hidden');
  document.getElementById('error-container').classList.add('hidden');
  document.getElementById('empty-container').classList.add('hidden');

  let filtered = state.courses;

  // 1. Filter by category tabs
  if (state.activeFilter !== 'all') {
    filtered = filtered.filter(c => c.filterType === state.activeFilter);
  }

  // 2. Filter by search query
  if (state.searchQuery) {
    filtered = filtered.filter(c => 
      c.name.toLowerCase().includes(state.searchQuery) || 
      c.description.toLowerCase().includes(state.searchQuery)
    );
  }

  if (filtered.length === 0) {
    showEmpty('No Course Found', 'No course matches your query. Try a different search keyword or reset the category filter.');
    return;
  }

  grid.innerHTML = filtered.map(course => {
    // Choose beautiful orange gradients for course graphics fallback
    const fallbackBg = `linear-gradient(135deg, #ffa726, #f57c00)`;
    
    let badgeText = 'Free Resource';
    if (course.filterType === 'premium') badgeText = 'Premium Batch';
    if (course.filterType === 'new-batches') badgeText = 'New Batch 2026';

    return `
      <div class="course-card" id="course-card-${course.id}">
        <span class="course-badge">${badgeText}</span>
        <div class="course-img-container" style="background: ${fallbackBg}">
          ${course.image ? `<img class="course-img" src="${course.image}" alt="${course.name}" loading="lazy" onerror="this.style.display='none'">` : ''}
          <div class="course-fallback-icon" style="position: absolute; top:0; left:0; width:100%; height:100%; display:none; align-items:center; justify-content:center; color:#fff; font-size:2rem;">
            <i data-lucide="shield"></i>
          </div>
        </div>
        <div class="course-body">
          <h3>${course.name}</h3>
          <p class="course-desc">${course.description}</p>
          <div class="course-meta">
            <span class="course-subjects-count">
              <i data-lucide="book-open"></i> ${course.totalSubjects} Subjects
            </span>
            <button class="btn-open-course" onclick="openCoursePortal('${course.id}', '${escapeHtml(course.name)}', '${escapeHtml(course.description)}')">
              Open Course <i data-lucide="chevron-right"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

/**
 * Render subjects grid
 */
function renderSubjects() {
  const grid = document.getElementById('subjects-grid');
  grid.classList.remove('hidden');
  document.getElementById('error-container').classList.add('hidden');
  document.getElementById('empty-container').classList.add('hidden');

  let filtered = state.subjects;

  // Filter by search query
  if (state.searchQuery) {
    filtered = filtered.filter(s => 
      s.name.toLowerCase().includes(state.searchQuery) ||
      s.teacher.toLowerCase().includes(state.searchQuery)
    );
  }

  if (filtered.length === 0) {
    showEmpty('No Subjects Found', 'No academic subjects match your query. Try searching for other topic branches.');
    return;
  }

  grid.innerHTML = filtered.map(subject => {
    const fallbackBg = `linear-gradient(135deg, #1e1e2f, #ff9800)`;
    
    return `
      <div class="subject-card" id="subject-card-${subject.id}">
        <div class="subject-img-wrap" style="background: ${fallbackBg}">
          ${subject.image ? `<img class="subject-img" src="${subject.image}" alt="${subject.name}" loading="lazy" onerror="this.style.display='none'">` : ''}
          <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #fff; opacity: 0.15;">
            <i data-lucide="award" style="width: 64px; height: 64px;"></i>
          </div>
        </div>
        <h3 class="subject-title">${subject.name}</h3>
        <p class="subject-teacher"><i data-lucide="user-check"></i> Faculty: ${subject.teacher}</p>
        <p class="subject-classes-count"><i data-lucide="tv"></i> Total: ${subject.numberOfClasses} Live Classes</p>
        <button class="btn-open-subject" onclick="openSubjectWorkspace('${subject.contentId}', '${escapeHtml(subject.name)}', '${escapeHtml(subject.teacher)}')">
          Open Subject <i data-lucide="graduation-cap"></i>
        </button>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

/**
 * Render subject workspace materials
 */
function renderContent() {
  const container = document.getElementById('content-items-container');
  container.classList.remove('hidden');
  document.getElementById('error-container').classList.add('hidden');
  document.getElementById('empty-container').classList.add('hidden');

  // Fill Header Title card dynamically
  document.getElementById('workspace-chapter-name').textContent = state.content.chapterName;
  document.getElementById('workspace-topic-name').textContent = state.content.topicName;

  let listHtml = [];

  // Render materials based on active category tab selection
  const showAll = state.activeTab === 'all';

  // 1. VIDEOS
  if (showAll || state.activeTab === 'videos') {
    let videos = state.content.videos;
    if (state.searchQuery) {
      videos = videos.filter(v => v.title.toLowerCase().includes(state.searchQuery));
    }
    videos.forEach(v => {
      listHtml.push(`
        <div class="material-item-card video-type">
          <div class="material-item-left">
            <div class="material-icon-box video">
              <i data-lucide="play-circle"></i>
            </div>
            <div class="material-info">
              <span class="material-badge video">Video Lecture</span>
              <h4 class="material-title">${v.title}</h4>
              <div class="material-meta">
                <span><i data-lucide="clock"></i> Duration: ${v.duration}</span>
                <span><i data-lucide="award"></i> Syllabic Lesson</span>
              </div>
            </div>
          </div>
          <button class="btn-material-action video" onclick="playLectureVideo('${escapeHtml(v.title)}', '${escapeHtml(v.url)}')">
            Play Video <i data-lucide="play-circle"></i>
          </button>
        </div>
      `);
    });
  }

  // 2. PDF NOTES
  if (showAll || state.activeTab === 'pdfs') {
    let pdfs = state.content.pdfs;
    if (state.searchQuery) {
      pdfs = pdfs.filter(p => p.title.toLowerCase().includes(state.searchQuery));
    }
    pdfs.forEach(p => {
      listHtml.push(`
        <div class="material-item-card pdf-type">
          <div class="material-item-left">
            <div class="material-icon-box pdf">
              <i data-lucide="file-text"></i>
            </div>
            <div class="material-info">
              <span class="material-badge pdf">PDF Lecture Notes</span>
              <h4 class="material-title">${p.title}</h4>
              <div class="material-meta">
                <span><i data-lucide="download-cloud"></i> Size: ${p.size}</span>
                <span><i data-lucide="check-square"></i> Curated Study Guide</span>
              </div>
            </div>
          </div>
          <a class="btn-material-action pdf" href="${p.url}" target="_blank" style="text-decoration:none;">
            Download Notes <i data-lucide="download"></i>
          </a>
        </div>
      `);
    });
  }

  // 3. ASSIGNMENTS
  if (showAll || state.activeTab === 'assignments') {
    let assignments = state.content.assignments;
    if (state.searchQuery) {
      assignments = assignments.filter(a => a.title.toLowerCase().includes(state.searchQuery));
    }
    assignments.forEach(a => {
      listHtml.push(`
        <div class="material-item-card assignment-type">
          <div class="material-item-left">
            <div class="material-icon-box assignment">
              <i data-lucide="clipboard-list"></i>
            </div>
            <div class="material-info">
              <span class="material-badge assignment">Assignment Quiz</span>
              <h4 class="material-title">${a.title}</h4>
              <div class="material-meta">
                <span><i data-lucide="clock"></i> Due Date: ${a.dueDate}</span>
                <span><i data-lucide="help-circle"></i> Objective Questions</span>
              </div>
            </div>
          </div>
          <a class="btn-material-action assignment" href="${a.url}" target="_blank" style="text-decoration:none;">
            Open Assessment <i data-lucide="external-link"></i>
          </a>
        </div>
      `);
    });
  }

  // 4. TESTS
  if (showAll || state.activeTab === 'tests') {
    let tests = state.content.tests;
    if (state.searchQuery) {
      tests = tests.filter(t => t.title.toLowerCase().includes(state.searchQuery));
    }
    tests.forEach(t => {
      listHtml.push(`
        <div class="material-item-card test-type">
          <div class="material-item-left">
            <div class="material-icon-box test">
              <i data-lucide="award"></i>
            </div>
            <div class="material-info">
              <span class="material-badge test">Syllabus Evaluation</span>
              <h4 class="material-title">${t.title}</h4>
              <div class="material-meta">
                <span><i data-lucide="timer"></i> Time limit: ${t.duration}</span>
                <span><i data-lucide="help-circle"></i> Exam Pattern: ${t.questions}</span>
              </div>
            </div>
          </div>
          <a class="btn-material-action test" href="${t.url}" target="_blank" style="text-decoration:none;">
            Start Test <i data-lucide="check-circle"></i>
          </a>
        </div>
      `);
    });
  }

  if (listHtml.length === 0) {
    let tabName = state.activeTab === 'all' ? 'materials' : state.activeTab;
    showEmpty(`No ${capitalize(tabName)} Found`, `There is no study material available inside this filter.`);
    return;
  }

  container.innerHTML = listHtml.join('');
  lucide.createIcons();
}

// ==========================================
// 6. EVENT & TRIGGER ROUTERS
// ==========================================

/**
 * Handle application routing based on URL hash
 * Enables persistence on refresh and browser navigation
 */
async function handleRouting() {
  const hash = window.location.hash;

  // Recovery of state from SessionStorage on Refresh
  if (!state.selectedCourse) {
    try {
      const savedCourse = sessionStorage.getItem('cds_selected_course');
      if (savedCourse) state.selectedCourse = JSON.parse(savedCourse);
    } catch (e) { console.error("Failed to parse saved course", e); }
  }
  if (!state.selectedSubject) {
    try {
      const savedSubject = sessionStorage.getItem('cds_selected_subject');
      if (savedSubject) state.selectedSubject = JSON.parse(savedSubject);
    } catch (e) { console.error("Failed to parse saved subject", e); }
  }

  if (!hash || hash === '#home' || hash === '#') {
    if (state.courses.length === 0) {
      loadCourses();
    } else {
      showScreen('home');
      renderCourses();
    }
  } else if (hash.startsWith('#course/')) {
    const courseId = hash.split('/')[1];
    if (courseId) {
      loadSubjects(courseId);
    } else {
      goHome();
    }
  } else if (hash.startsWith('#content/')) {
    const contentId = hash.split('/')[1];
    if (contentId) {
      // Update header content metrics from state if available
      if (state.selectedSubject) {
        document.getElementById('current-subject-title').textContent = state.selectedSubject.name;
        document.getElementById('current-subject-teacher').textContent = state.selectedSubject.teacher;
      }
      loadContent(contentId);
    } else {
      goHome();
    }
  } else {
    goHome();
  }
}

function openCoursePortal(courseId, name, description) {
  state.selectedCourse = { id: courseId, name, description };
  // Save to session storage for refresh persistence
  sessionStorage.setItem('cds_selected_course', JSON.stringify(state.selectedCourse));
  window.location.hash = `course/${courseId}`;
}

function openSubjectWorkspace(contentId, name, teacher) {
  state.selectedSubject = { id: contentId, name, teacher };
  // Save to session storage for refresh persistence
  sessionStorage.setItem('cds_selected_subject', JSON.stringify(state.selectedSubject));
  window.location.hash = `content/${contentId}`;
}

function handleBackNavigation() {
  // Use browser history to go back one step
  window.history.back();
}

function goHome() {
  state.selectedCourse = null;
  state.selectedSubject = null;
  state.subjects = [];
  state.content = null;
  sessionStorage.removeItem('cds_selected_course');
  sessionStorage.removeItem('cds_selected_subject');
  window.location.hash = 'home';
}

function setSearchQuery(val) {
  state.searchQuery = val.toLowerCase().trim();
  const searchInput = document.getElementById('global-search');
  searchInput.value = val;
}

function handleSearch(query) {
  state.searchQuery = query.toLowerCase().trim();
  
  if (state.currentScreen === 'home') {
    renderCourses();
  } else if (state.currentScreen === 'subjects') {
    renderSubjects();
  } else if (state.currentScreen === 'content') {
    renderContent();
  }
}

function setCourseFilter(filter) {
  state.activeFilter = filter;
  renderCourses();
}

function setContentTab(tab) {
  state.activeTab = tab;
  renderContent();
}

function updateTabBadges() {
  if (!state.content) return;
  
  const counts = {
    all: state.content.videos.length + state.content.pdfs.length + state.content.assignments.length + state.content.tests.length,
    videos: state.content.videos.length,
    pdfs: state.content.pdfs.length,
    assignments: state.content.assignments.length,
    tests: state.content.tests.length
  };

  document.getElementById('badge-count-all').textContent = counts.all;
  document.getElementById('badge-count-videos').textContent = counts.videos;
  document.getElementById('badge-count-pdfs').textContent = counts.pdfs;
  document.getElementById('badge-count-assignments').textContent = counts.assignments;
  document.getElementById('badge-count-tests').textContent = counts.tests;

  // Top header stat badges
  document.getElementById('current-subject-class-count').textContent = counts.videos;
  document.getElementById('current-subject-pdf-count').textContent = counts.pdfs;
}

// ==========================================
// 7. SKELETONS & LOADER CONTROLLER
// ==========================================

function showLoader(containerId, type, count = 4) {
  const container = document.getElementById(containerId);
  container.classList.remove('hidden');
  document.getElementById('error-container').classList.add('hidden');
  document.getElementById('empty-container').classList.add('hidden');

  let loaderHtml = '';

  for (let i = 0; i < count; i++) {
    if (type === 'course') {
      loaderHtml += `
        <div class="skeleton-card">
          <div class="skeleton-shimmer"></div>
          <div class="skeleton-img"></div>
          <div class="skeleton-line title"></div>
          <div class="skeleton-line text-1"></div>
          <div class="skeleton-line text-2"></div>
          <div class="skeleton-line btn"></div>
        </div>
      `;
    } else if (type === 'subject') {
      loaderHtml += `
        <div class="subject-card skeleton-card">
          <div class="skeleton-shimmer"></div>
          <div class="skeleton-img" style="height: 140px;"></div>
          <div class="skeleton-line title"></div>
          <div class="skeleton-line text-1" style="width: 50%;"></div>
          <div class="skeleton-line btn" style="width: 100%; height: 38px;"></div>
        </div>
      `;
    } else if (type === 'material') {
      loaderHtml += `
        <div class="skeleton-material">
          <div class="skeleton-shimmer"></div>
          <div class="skeleton-icon"></div>
          <div class="skeleton-material-body">
            <div class="skeleton-line title" style="width: 30%;"></div>
            <div class="skeleton-line text-1" style="width: 75%;"></div>
          </div>
        </div>
      `;
    }
  }

  container.innerHTML = loaderHtml;
}

function showEmpty(title, message, btnText = null, callback = null) {
  const emptyContainer = document.getElementById('empty-container');
  const emptyTitle = document.getElementById('empty-title');
  const emptyMessage = document.getElementById('empty-message');
  const emptyBtn = document.getElementById('empty-action-btn');

  // Hide lists
  hideActiveGrids();

  emptyTitle.textContent = title;
  emptyMessage.textContent = message;

  if (btnText && callback) {
    emptyBtn.classList.remove('hidden');
    emptyBtn.textContent = btnText;
    emptyBtn.onclick = callback;
  } else {
    emptyBtn.classList.add('hidden');
  }

  emptyContainer.classList.remove('hidden');
}

function showError(message, retryCallback) {
  const errorContainer = document.getElementById('error-container');
  const errorMsg = document.getElementById('error-message-text');
  const retryBtn = document.getElementById('error-retry-btn');

  hideActiveGrids();

  errorMsg.textContent = message;
  retryBtn.onclick = retryCallback;

  errorContainer.classList.remove('hidden');
}

function hideActiveGrids() {
  document.getElementById('courses-grid').classList.add('hidden');
  document.getElementById('subjects-grid').classList.add('hidden');
  document.getElementById('content-items-container').classList.add('hidden');
}

// ==========================================
// 8. ROUTING & SCREEN ANIMATOR
// ==========================================

function showScreen(screen) {
  state.currentScreen = screen;

  // Toggle dynamic class listings
  document.getElementById('screen-home').classList.toggle('active', screen === 'home');
  document.getElementById('screen-subjects').classList.toggle('active', screen === 'subjects');
  document.getElementById('screen-content').classList.toggle('active', screen === 'content');

  // Global breadcrumb rendering
  const breadcrumbContainer = document.getElementById('global-breadcrumb-bar');
  const bCourse = document.getElementById('breadcrumb-course');
  const bSeparatorSubject = document.getElementById('breadcrumb-separator-subject');
  const bSubject = document.getElementById('breadcrumb-subject');
  const searchInput = document.getElementById('global-search');

  // Reset search box keyword on routing, keeping input clean
  setSearchQuery('');

  if (screen === 'home') {
    breadcrumbContainer.classList.add('hidden');
    searchInput.placeholder = "Search courses instantly...";
  } else {
    breadcrumbContainer.classList.remove('hidden');

    if (screen === 'subjects') {
      searchInput.placeholder = "Search subjects instantly...";
      bCourse.classList.remove('hidden');
      bCourse.textContent = state.selectedCourse?.name || 'Course';
      bSeparatorSubject.classList.add('hidden');
      bSubject.classList.add('hidden');
    } else if (screen === 'content') {
      searchInput.placeholder = "Search materials instantly...";
      bCourse.classList.remove('hidden');
      bCourse.textContent = state.selectedCourse?.name || 'Course';
      bSeparatorSubject.classList.remove('hidden');
      bSubject.classList.remove('hidden');
      bSubject.textContent = state.selectedSubject?.name || 'Subject';
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// 9. MODERN VIDEO PLAYER INTERACTIVITY
// ==========================================

function playLectureVideo(title, url) {
  const modal = document.getElementById('video-modal');
  const titleDisplay = document.getElementById('modal-video-title');
  const playerDisplay = document.getElementById('video-player-display');

  titleDisplay.textContent = title;

  // Handle external video links (like Zoom)
  const isExternal = url && (url.includes('zoom.us') || url.includes('drive.google.com') || url.includes('youtube.com') || url.includes('youtu.be'));

  playerDisplay.innerHTML = `
    <div class="video-loader-placeholder" style="background: var(--bg-card); border-radius: 12px; overflow: hidden;">
      <div class="video-play-action-wrapper" style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 350px; padding: 40px 20px; background: radial-gradient(circle at center, rgba(245, 124, 0, 0.05) 0%, transparent 70%);">

        <!-- Large Interactive Play Button -->
        <div class="play-btn-pulse-wrapper" style="position: relative; margin-bottom: 30px;">
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 120px; height: 120px; background: rgba(245, 124, 0, 0.2); border-radius: 50%; animation: pulse-orange 2s infinite;"></div>
          <div class="play-btn-circle" onclick="${isExternal ? `window.open('${url}', '_blank')` : 'alert(\'Connecting to high-speed lecture stream...\')'}"
               style="cursor: pointer; position: relative; z-index: 2; width: 90px; height: 90px; background: linear-gradient(135deg, #ffa726, #f57c00); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 30px rgba(245, 124, 0, 0.4); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
            <i data-lucide="play" style="width: 45px; height: 45px; color: white; fill: white; margin-left: 6px;"></i>
          </div>
        </div>

        <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-color); margin-bottom: 12px; letter-spacing: -0.5px;">Start Your Learning</h2>
        <p class="video-sub-text" style="color: var(--text-secondary); font-size: 1rem; max-width: 340px; line-height: 1.6; margin-bottom: 32px;">
          ${isExternal ? 'This lecture is ready on our external streaming partner. Join now for the interactive session.' : 'Your high-definition study material is ready. Establishing a secure connection to the CDS server...'}
        </p>

        <div style="display: flex; gap: 15px; flex-wrap: wrap; justify-content: center;">
          ${isExternal ? `
            <a href="${url}" target="_blank" class="btn-play-main" style="background: #f57c00; color: white; padding: 16px 48px; border-radius: 50px; text-decoration: none; display: inline-flex; align-items: center; gap: 12px; font-weight: 700; font-size: 1.1rem; box-shadow: 0 8px 25px rgba(245, 124, 0, 0.3); transition: all 0.3s ease;">
              Play Now <i data-lucide="play"></i>
            </a>
          ` : `
            <button onclick="alert('Mock Player: Starting video stream...')" class="btn-play-main" style="border: none; cursor: pointer; background: #f57c00; color: white; padding: 16px 48px; border-radius: 50px; text-decoration: none; display: inline-flex; align-items: center; gap: 12px; font-weight: 700; font-size: 1.1rem; box-shadow: 0 8px 25px rgba(245, 124, 0, 0.3); transition: all 0.3s ease;">
              Play Now <i data-lucide="play"></i>
            </button>
          `}
        </div>

        <style>
          @keyframes pulse-orange {
            0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.8; }
            100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
          }
          .play-btn-circle:hover { transform: scale(1.1); }
          .btn-play-main:hover { transform: translateY(-3px); box-shadow: 0 12px 30px rgba(245, 124, 0, 0.4); }
        </style>
      </div>
    </div>
  `;
  
  lucide.createIcons();
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeVideoPlayer() {
  const modal = document.getElementById('video-modal');
  modal.classList.add('hidden');
  
  // Re-enable body scrolling
  document.body.style.overflow = '';
}

// ==========================================
// 10. LIGHT & DARK THEME SETTINGS
// ==========================================

function initTheme() {
  // Read preference from localStorage
  const localTheme = localStorage.getItem('cds-study-theme');
  if (localTheme) {
    state.theme = localTheme;
  } else {
    // Media query fallback
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    state.theme = systemDark ? 'dark' : 'light';
  }

  applyTheme();
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('cds-study-theme', state.theme);
  applyTheme();
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
}

// ==========================================
// 11. GENERAL UTILITY HELPERS
// ==========================================

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
