/**
 * Sets up multi-touch pinch-to-zoom and panning for the image modal.
 * Optimized for mobile touch interactions.
 */
export function setupImageZoomHandlers() {
    const modal = document.getElementById('imageModal');
    const img = document.getElementById('imageModalImg');
    if (!modal || !img) return;

    let scale = 1;
    let lastScale = 1;
    let translateX = 0;
    let translateY = 0;
    let lastTouchX = 0;
    let lastTouchY = 0;
    let initialPinchDistance = 0;
    let isDragging = false;
    let lastTapTime = 0;

    img.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            initialPinchDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            isDragging = false;
        } else if (e.touches.length === 1) {
            isDragging = scale > 1; // Only pan if zoomed in
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;

            // Double tap detection
            const currentTime = Date.now();
            const tapDiff = currentTime - lastTapTime;
            if (tapDiff < 300 && tapDiff > 0) {
                e.preventDefault();
                toggleZoom(e.touches[0].clientX, e.touches[0].clientY);
            }
            lastTapTime = currentTime;
        }
    }, { passive: false });

    img.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            
            if (initialPinchDistance > 0) {
                const zoomFactor = currentDistance / initialPinchDistance;
                scale = Math.min(Math.max(lastScale * zoomFactor, 1), 6);
                updateImageTransform();
            }
        } else if (e.touches.length === 1 && isDragging) {
            e.preventDefault();
            const deltaX = e.touches[0].clientX - lastTouchX;
            const deltaY = e.touches[0].clientY - lastTouchY;
            
            translateX += deltaX;
            translateY += deltaY;
            
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
            updateImageTransform();
        }
    }, { passive: false });

    img.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            lastScale = scale;
            initialPinchDistance = 0;
        }
        if (e.touches.length === 0) {
            isDragging = false;
            if (scale < 1.1) resetZoom();
        }
    });

    function toggleZoom(touchX, touchY) {
        if (scale > 1.1) resetZoom();
        else {
            scale = 3;
            lastScale = 3;
            updateImageTransform();
        }
    }

    function resetZoom() {
        scale = 1;
        lastScale = 1;
        translateX = 0;
        translateY = 0;
        img.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        updateImageTransform();
        setTimeout(() => { img.style.transition = ''; }, 300);
    }

    function updateImageTransform() {
        img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }

    // Expose reset to window so it can be called from openImageModal
    window.resetImageZoom = resetZoom;
}
