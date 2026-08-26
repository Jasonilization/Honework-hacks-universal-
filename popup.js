const apiKeyBox =
    document.getElementById("apiKey");

const saveKey =
    document.getElementById("saveKey");

const scan =
    document.getElementById("scan");

const loading =
    document.getElementById("loading");

const loadingModel =
    document.getElementById("loadingModel");

const result =
    document.getElementById("result");

const error =
    document.getElementById("error");

const question =
    document.getElementById("question");

const answer =
    document.getElementById("answer");

const steps =
    document.getElementById("steps");

const hint =
    document.getElementById("hint");

const copy =
    document.getElementById("copy");

const dot =
    document.getElementById("dot");

const statusText =
    document.getElementById("statusText");


// ==================================================
// GEMINI MODELS
// ==================================================

const MODELS = [

    "gemini-3.7-flash",

    "gemini-3.6-flash",

    "gemini-3.5-flash"

];


// ==================================================
// LOAD SAVED API KEY
// ==================================================

chrome.storage.local.get(
    ["geminiKey"],
    function (data) {

        if (data.geminiKey) {

            apiKeyBox.value =
                data.geminiKey;

            setReady();

        }

    }
);


// ==================================================
// SAVE API KEY
// ==================================================

saveKey.addEventListener(
    "click",
    async function () {

        const key =
            apiKeyBox.value.trim();

        if (!key) {

            showError(
                "NO GEMINI API KEY ENTERED."
            );

            return;

        }

        await chrome.storage.local.set({

            geminiKey: key

        });

        setReady();

        showMessage(
            "GEMINI API KEY SAVED."
        );

    }
);


// ==================================================
// SCREEN SCAN
// ==================================================

scan.addEventListener(
    "click",
    async function () {

        clearMessages();

        result.classList.add(
            "hidden"
        );

        const stored =
            await chrome.storage.local.get(
                ["geminiKey"]
            );

        const key =
            stored.geminiKey;

        if (!key) {

            showError(
                "SAVE YOUR GEMINI API KEY FIRST."
            );

            return;

        }

        scan.disabled = true;

        loading.classList.remove(
            "hidden"
        );

        let screenshot = null;

        try {

            setStatus(
                "CAPTURING"
            );

            /*
             * Capture only the visible
             * portion of the current tab.
             */

            screenshot =
                await chrome.tabs.captureVisibleTab(
                    null,
                    {
                        format: "jpeg",
                        quality: 70
                    }
                );


            setStatus(
                "ANALYZING"
            );


            /*
             * Send screenshot to Gemini.
             */

            const data =
                await askGemini(
                    key,
                    screenshot
                );


            /*
             * Display result.
             */

            displayResult(
                data
            );


            setStatus(
                "COMPLETE"
            );

        } catch (err) {

            showError(
                "ERROR: " +
                err.message
            );

            setStatus(
                "ERROR"
            );

        } finally {

            /*
             * Delete our reference to
             * the screenshot.

             * It is never written to a file
             * or chrome.storage.
             */

            screenshot = null;

            loading.classList.add(
                "hidden"
            );

            scan.disabled = false;

        }

    }
);


// ==================================================
// GEMINI REQUEST WITH FALLBACK
// ==================================================

async function askGemini(
    key,
    imageData
) {

    /*
     * Keep the screenshot in memory
     * only for this request.
     */

    const base64 =
        imageData.split(",")[1];


    const prompt = `

You are Sparx AI.

You are an educational school maths tutor.

Look carefully at the supplied screenshot.

Find the visible maths question.

Solve it accurately.

Return ONLY valid JSON in exactly
this structure:

{
  "question": "detected question",
  "answer": "final answer",
  "steps": [
    "step 1",
    "step 2",
    "step 3"
  ],
  "hint": "short useful hint"
}

Rules:

- Carefully inspect the screenshot.
- Do not guess unreadable information.
- Check all arithmetic.
- Explain the mathematics clearly.
- Keep explanations appropriate for a school student.
- If there is no maths question visible,
  say that in the question field.
- Do not include markdown.
- Return valid JSON only.

`;


    let lastError = null;


    /*
     * Try each model.
     */

    for (
        let modelIndex = 0;
        modelIndex < MODELS.length;
        modelIndex++
    ) {

        const model =
            MODELS[modelIndex];


        /*
         * Three attempts per model.
         */

        for (
            let attempt = 0;
            attempt < 3;
            attempt++
        ) {

            try {

                loadingModel.textContent =
                    "MODEL: " +
                    model +
                    " // TRY " +
                    (attempt + 1);


                /*
                 * Exponential backoff.

                 * Attempt 1:
                 * no wait

                 * Attempt 2:
                 * ~1 second

                 * Attempt 3:
                 * ~2 seconds
                 */

                if (attempt > 0) {

                    const wait =
                        Math.pow(
                            2,
                            attempt - 1
                        ) * 1000;

                    await sleep(
                        wait
                    );

                }


                const url =
                    "https://generativelanguage.googleapis.com/v1beta/models/" +
                    model +
                    ":generateContent?key=" +
                    encodeURIComponent(
                        key
                    );


                const response =
                    await fetch(
                        url,
                        {

                            method:
                                "POST",

                            headers: {

                                "Content-Type":
                                    "application/json"

                            },

                            body:
                                JSON.stringify({

                                    contents: [

                                        {

                                            parts: [

                                                {

                                                    text:
                                                        prompt

                                                },

                                                {

                                                    inline_data: {

                                                        mime_type:
                                                            "image/jpeg",

                                                        data:
                                                            base64

                                                    }

                                                }

                                            ]

                                        }

                                    ],

                                    generationConfig: {

                                        temperature:
                                            0.1,

                                        responseMimeType:
                                            "application/json"

                                    }

                                })

                        }
                    );


                /*
                 * SUCCESS
                 */

                if (response.ok) {

                    const data =
                        await response.json();


                    const text =
                        data
                            ?.candidates?.[0]
                            ?.content?.parts?.[0]
                            ?.text;


                    if (!text) {

                        throw new Error(
                            "Gemini returned an empty response."
                        );

                    }


                    let parsed;

                    try {

                        parsed =
                            JSON.parse(
                                text
                            );

                    } catch {

                        throw new Error(
                            "Gemini returned invalid JSON."
                        );

                    }


                    return parsed;

                }


                /*
                 * ERROR
                 */

                const raw =
                    await response.text();


                let message =
                    "HTTP " +
                    response.status;


                try {

                    const json =
                        JSON.parse(
                            raw
                        );

                    message =
                        json
                            ?.error
                            ?.message ||
                        message;

                } catch {

                    // Keep original message.

                }


                lastError =
                    new Error(
                        "HTTP " +
                        response.status +
                        ": " +
                        message
                    );


                /*
                 * Retry temporary errors.

                 * 429 = rate limit
                 * 500 = server error
                 * 502 = gateway
                 * 503 = unavailable
                 * 504 = timeout
                 */

                const temporary =
                    [

                        429,
                        500,
                        502,
                        503,
                        504

                    ].includes(
                        response.status
                    );


                if (!temporary) {

                    throw lastError;

                }


            } catch (err) {

                lastError =
                    err;


                /*
                 * If this is the final attempt
                 * of the final model, stop.
                 */

                const finalAttempt =
                    modelIndex ===
                        MODELS.length - 1 &&
                    attempt === 2;


                if (finalAttempt) {

                    throw lastError;

                }

            }

        }


        /*
         * Current model failed.

         * Move to next model.
         */

        if (
            modelIndex <
            MODELS.length - 1
        ) {

            setStatus(
                "FALLBACK"
            );

        }

    }


    throw (
        lastError ||
        new Error(
            "ALL GEMINI MODELS FAILED."
        )
    );

}


// ==================================================
// DISPLAY RESULT
// ==================================================

function displayResult(
    data
) {

    question.textContent =
        data.question ||
        "Question not detected.";


    answer.textContent =
        data.answer ||
        "No answer returned.";


    if (
        Array.isArray(
            data.steps
        )
    ) {

        steps.textContent =
            data.steps
                .map(
                    function (
                        step,
                        index
                    ) {

                        return (
                            (index + 1) +
                            ". " +
                            step
                        );

                    }
                )
                .join("\n");

    } else {

        steps.textContent =
            "No working returned.";

    }


    hint.textContent =
        data.hint ||
        "No hint returned.";


    result.classList.remove(
        "hidden"
    );

}


// ==================================================
// COPY ANSWER
// ==================================================

copy.addEventListener(
    "click",
    async function () {

        const text =
            answer.textContent;


        if (
            !text ||
            text ===
                "No answer returned."
        ) {

            return;

        }


        await navigator.clipboard.writeText(
            text
        );


        copy.textContent =
            "[ COPIED ]";


        setTimeout(
            function () {

                copy.textContent =
                    "[ COPY ANSWER ]";

            },
            1200
        );

    }
);


// ==================================================
// HELPERS
// ==================================================

function sleep(ms) {

    return new Promise(
        function (resolve) {

            setTimeout(
                resolve,
                ms
            );

        }
    );

}


function setReady() {

    dot.style.background =
        "#00ff88";

    statusText.textContent =
        "READY";

}


function setStatus(
    text
) {

    statusText.textContent =
        text;

}


function showError(
    message
) {

    error.textContent =
        message;

    error.style.color =
        "#ff5555";

    error.style.borderColor =
        "#ff3333";

    error.classList.remove(
        "hidden"
    );

}


function showMessage(
    message
) {

    error.textContent =
        message;

    error.style.color =
        "#00ff88";

    error.style.borderColor =
        "#00ff88";

    error.classList.remove(
        "hidden"
    );

}


function clearMessages() {

    error.classList.add(
        "hidden"
    );

}