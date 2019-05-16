import AbstractSetting from "./AbstractSetting.js";

export default class IntegerSetting extends AbstractSetting {
	constructor(config) {
		if (typeof config === "number") {
			super(config, v=>(v|0));
		} else if (typeof config === "object" && typeof config.value === "number") {
			if (typeof config.min === "number" && typeof config.max === "number") {
				super(config.value, v=>(Math.min(Math.max(v, config.min), config.max)|0));
			} else if (typeof config.min === "number") {
				super(config.value, v=>(Math.max(v ,config.min)|0));
			} else if (typeof config.max === "number") {
				super(config.value, v=>(Math.min(v, config.max)|0));
			} else {
				super(config.value, v=>(v|0));
			}
		} else {
			console.warn("Invalid parameter");
			super(1);
		}
	}
}