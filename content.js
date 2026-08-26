(function () {

    /*
     * Prevent duplicate buttons.
     */

    if (
        document.getElementById(
            "sparx-ai-helper"
        )
    ) {

        return;

    }


    /*
     * Create floating button.
     */

    const button =
        document.createElement(
            "button"
        );


    button.id =
        "sparx-ai-helper";


    button.textContent =
        "SPARX AI";


    button.style.position =
        "fixed";


    button.style.bottom =
        "20px";


    button.style.right =
        "20px";


    button.style.zIndex =
        "2147483647";


    button.style.padding =
        "10px 15px";


    button.style.background =
        "#050505";


    button.style.color =
        "#00ff88";


    button.style.border =
        "1px solid #00ff88";


    button.style.borderRadius =
        "5px";


    button.style.fontFamily =
        "monospace";


    button.style.fontWeight =
        "bold";


    button.style.cursor =
        "pointer";


    button.style.boxShadow =
        "0 0 10px #00ff8833";


    button.title =
        "Open Sparx AI";


    button.addEventListener(
        "click",
        function () {

            alert(
                "Click the Sparx AI extension icon in Chrome, then select ANALYZE CURRENT SCREEN."
            );

        }
    );


    document.body.appendChild(
        button
    );

})();