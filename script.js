const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

// Base URLs for TMDB
const TMDB_SEARCH_URL = "https://api.themoviedb.org/3/search/movie";
const TMDB_DISCOVER_URL = "https://api.themoviedb.org/3/discover/movie";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w200";

// Retrieve or prompt for your TMDB Read Access Token
function getApiKey() {
    let key = sessionStorage.getItem('tmdb_key');
    if (!key) {
        key = prompt("Please enter your TMDB API Read Access Token (v4 auth):");
        if (key) {
            sessionStorage.setItem('tmdb_key', key.trim());
        }
    }
    return key;
}

// Append a message bubble to the chat window
function appendMessage(sender, content, isHtml = false) {
    const bubble = document.createElement('div');
    bubble.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');
    
    if (isHtml) {
        bubble.innerHTML = content;
    } else {
        bubble.textContent = content;
    }

    chatBox.appendChild(bubble);
    chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll to latest message
}

// Search TMDB for movies
async function fetchMovies(query, token) {
    const url = `${TMDB_SEARCH_URL}?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`;
    const response = await fetch(url, {
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json;charset=utf-8"
        }
    });

    if (!response.ok) {
        throw new Error(`TMDB error: ${response.status}`);
    }

    const data = await response.json();
    return data.results;
}

// Process user input
async function handleSend() {
    const query = userInput.value.trim();
    if (!query) return;

    const token = getApiKey();
    if (!token) {
        appendMessage('bot', "I need a TMDB API token to search for movies!");
        return;
    }

    // Display user message
    appendMessage('user', query);
    userInput.value = '';

    // Show temporary thinking message
    const thinkingBubble = document.createElement('div');
    thinkingBubble.classList.add('message', 'bot-message');
    thinkingBubble.textContent = "Scanning the movie archives...";
    chatBox.appendChild(thinkingBubble);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const results = await fetchMovies(query, token);
        thinkingBubble.remove(); // Remove loading placeholder

        if (!results || results.length === 0) {
            appendMessage('bot', `I couldn't find any movies matching "${query}". Try another title, genre, or keyword!`);
            return;
        }

        // Grab top 2 results to display
        const topMovies = results.slice(0, 2);
        let replyHtml = `Here's what I found for <strong>${query}</strong>:<br>`;

        topMovies.forEach(movie => {
            const poster = movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : 'https://via.placeholder.com/90x135?text=No+Poster';
            const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
            const rating = movie.vote_average ? `⭐ ${movie.vote_average.toFixed(1)}/10` : 'No rating';
            const overview = movie.overview ? (movie.overview.slice(0, 140) + '...') : 'No description available.';

            replyHtml += `
                <div class="movie-card">
                    <img src="${poster}" alt="${movie.title} poster">
                    <div class="movie-details">
                        <div class="movie-title">${movie.title}</div>
                        <div class="movie-meta">${year} • ${rating}</div>
                        <div>${overview}</div>
                    </div>
                </div>
            `;
        });

        appendMessage('bot', replyHtml, true);

    } catch (error) {
        console.error(error);
        thinkingBubble.remove();
        appendMessage('bot', `Encountered an issue fetching movie data: ${error.message}`);
    }
}

// Event Listeners
sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSend();
});
