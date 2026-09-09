const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

let movieDatabase = [];
let chatHistory = []; // Keeps track of the conversation

// 1. Load the Kaggle CSV file on startup
Papa.parse('./imdb_top_1000.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
        movieDatabase = results.data;
        console.log(`Loaded ${movieDatabase.length} movies into the database!`);
    }
});

// 2. Retrieve OpenRouter Key securely via browser session
function getApiKey() {
    let key = sessionStorage.getItem('openrouter_key');
    if (!key) {
        key = prompt("Please enter your OpenRouter API Key:");
        if (key) sessionStorage.setItem('openrouter_key', key.trim());
    }
    return key;
}

// 3. Print messages to the screen
function appendMessage(sender, content, isHtml = false) {
    const bubble = document.createElement('div');
    bubble.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');
    if (isHtml) {
        bubble.innerHTML = content;
    } else {
        bubble.textContent = content;
    }
    chatBox.appendChild(bubble);
    chatBox.scrollTop = chatBox.scrollHeight;
    return bubble;
}

// 4. Search the local database
function findRelevantMovies(query) {
    const q = query.toLowerCase();
    const matches = movieDatabase.filter(movie => {
        const title = (movie.Series_Title || "").toLowerCase();
        const genre = (movie.Genre || "").toLowerCase();
        const overview = (movie.Overview || "").toLowerCase();
        const director = (movie.Director || "").toLowerCase();
        
        return title.includes(q) || genre.includes(q) || overview.includes(q) || director.includes(q);
    });
    return matches.slice(0, 3); // Return only top 3 to save AI token limits
}

// 5. Send User Request to OpenRouter AI
async function handleSend() {
    let query = userInput.value.trim();
    if (!query) return;

    appendMessage('user', query);
    userInput.value = '';
    const lowerQuery = query.toLowerCase();

    // -- THE EASTER EGG --
    if (lowerQuery.includes("who made u") || lowerQuery.includes("who created you")) {
        setTimeout(() => {
            appendMessage('bot', "I was created by MOATH KHALED AL-TURK! He's a software engineering student who builds efficient and intelligent applications. Is there anything else about my creation or movies I can help with?");
        }, 400);
        return;
    }

    const key = getApiKey();
    if (!key) {
        appendMessage('bot', "I need your OpenRouter API key to function.");
        return;
    }

    const thinkingBubble = appendMessage('bot', "Thinking...");

    try {
        // Find movies from the CSV that match what the user is talking about
        const matchedMovies = findRelevantMovies(query);
        let databaseContext = "";

        if (matchedMovies.length > 0) {
            databaseContext = "Use the following verified movies from the database to answer the user:\n";
            matchedMovies.forEach(m => {
                databaseContext += `- ${m.Series_Title} (${m.Released_Year}). Genre: ${m.Genre}. Rating: ${m.IMDB_Rating}/10. Plot: ${m.Overview}\n`;
            });
        } else {
            databaseContext = "No specific movies matched in the local database. Rely on your general knowledge.";
        }

        // Add the user's message to the conversation memory
        chatHistory.push({ role: "user", content: query });

       // Build the system instructions for this turn
     const systemMessage = {
            role: "system",
            content: `Your name is hussBot. Never refer to yourself as CineBot or any other name.
            You are a friendly and futuristic AI movie critic created by MOATH KHALED AL-TURK.
            
            CORE INSTRUCTIONS:
            1. Whenever the user greets you (e.g., "hi", "hello", "hey"), respond warmly and conversationally, but you MUST mention your name (hussBot) and that you were made by Moath.
            2. If asked who made you or who you are, state that your name is hussBot and you were created by MOATH KHALED AL-TURK.
            
            Database Context:
            ${databaseContext}
            
            Format your response clearly. Keep it concise, conversational, and natural.`
        };
        // Combine system instructions with the memory history
        const messagesToSend = [systemMessage, ...chatHistory];

        // Call the free OpenRouter model
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${key}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "openrouter/free", // Automatically selects a free model
                messages: messagesToSend
            })
        });

        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message);
        }

        // Extract text and convert newlines to HTML line breaks so it looks nice
        let botText = data.choices[0].message.content;
        let formattedBotText = botText.replace(/\n/g, "<br>");
        
        thinkingBubble.remove();
        appendMessage('bot', formattedBotText, true);

        // Save AI response to memory so it remembers for the next question!
        chatHistory.push({ role: "assistant", content: botText });

    } catch (error) {
        thinkingBubble.remove();
        console.error(error);
        appendMessage('bot', `Oops, ran into an issue: ${error.message}`);
    }
}

// 6. Event Listeners for Clicking and Typing
sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSend();
});
