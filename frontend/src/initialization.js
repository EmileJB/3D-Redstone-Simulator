import { displayFatalError } from './displayFatalError.js';
import * as TextureHandler from './modules/TextureHandler.js';
import * as GraphicsHandler from './modules/GraphicsHandler.js';
import * as WorldHandler from './modules/WorldHandler.js';
import * as GameLoopHandler from './modules/GameLoopHandler.js';
import * as ForegroundHandler from './modules/ForegroundHandler.js';
import * as InputHandler from './modules/InputHandler.js';
import * as MultiplayerHandler from './modules/Multiplayer/MultiplayerHandler.js';

/**
 * @param {string} str
 */
function setLoadingText(str) {
	const textElement = document.querySelector('.text');
	if (!(textElement instanceof HTMLElement)) {
		return console.warn('Could not find loading text to display loading text');
	}
	textElement.innerText = str;
}

function pauseGame() {
	GameLoopHandler.stop();
	ForegroundHandler.showPausedGame();
}

async function initialization() {
	try {
		setLoadingText('Creating WebGL Context');
		const canvas = document.createElement('canvas');
        if (!canvas) {
            throw new Error('Canvas not present on page');
        }

		const gl = canvas.getContext('webgl');
		if (gl == null) {
			throw new Error('WebGL Context could not be created');
		}

		setLoadingText('Loading Textures');
		await TextureHandler.load();

		setLoadingText('Initializing the Graphics Engine');
		const {scene, camera} = await GraphicsHandler.load(canvas, gl);

		setLoadingText('Initializing the World');
		await WorldHandler.load();

		setLoadingText('Initializing the Main Loop');
		await GameLoopHandler.load(
			(frame) => {
				InputHandler.update(frame);
				if (MultiplayerHandler.active) {
					MultiplayerHandler.update();
				}
			},
			GraphicsHandler.draw,
			(ms) => {console.log(`Running behind ${ms.toFixed(0)}ms`)}
		);

		setLoadingText('Initializing the Controls');
		await InputHandler.load(canvas, scene, camera);

		setLoadingText('Initializing Multiplayer');
		//await MultiplayerHandler.load();
		
		//if (!MultiplayerHandler.active) {
			WorldHandler.startLocalWorld();
		//}

		setLoadingText('Initializing the GUI');
		await ForegroundHandler.load();

		await new Promise(r => setTimeout(r, 250));

		ForegroundHandler.start();
		GameLoopHandler.start();
	} catch (err) {
		console.error(err);
        displayFatalError(err);
	}
}

export default initialization;
