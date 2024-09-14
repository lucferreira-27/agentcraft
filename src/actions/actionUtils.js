const Joi = require('joi');

const parameterSchemas = {
  followPlayer: Joi.object({
    username: Joi.string().required(),
    stopAtPlayerPosition: Joi.boolean().default(false),
    duration: Joi.number().min(0).default(0)
  }),
  collectBlock: Joi.object({
    blockType: Joi.string().required(),
    quantity: Joi.number().integer().min(1).required()
  }),
  buildStructure: Joi.object({
    structureType: Joi.string().required(),
    location: Joi.object({
      x: Joi.number().required(),
      y: Joi.number().required(),
      z: Joi.number().required()
    }).required()
  }),
  attackEntity: Joi.object({
    entityType: Joi.string().required()
  }),
  say: Joi.object({
    message: Joi.string().required()
  }),
  eat: Joi.object({
    foodName: Joi.string().required()
  }),
  dropItems: Joi.object({
    itemName: Joi.string().required(),
    quantity: Joi.number().integer().min(1).required()
  }),
  equip: Joi.object({
    itemName: Joi.string().required(),
    destination: Joi.string().valid('mainhand', 'offhand', 'head', 'chest', 'legs', 'feet').required()
  }),
  unequip: Joi.object({
    destination: Joi.string().valid('mainhand', 'offhand', 'head', 'chest', 'legs', 'feet').required()
  }),
  jump: Joi.object({}), // No parameters required for jump
  craft: Joi.object({
    itemName: Joi.string().required(),
    quantity: Joi.number().integer().min(1).required()
  })
};

function validateParameters(actionName, parameters) {
  const schema = parameterSchemas[actionName];
  if (!schema) {
    throw new Error(`No parameter schema defined for action: ${actionName}`);
  }

  const { error, value } = schema.validate(parameters, { abortEarly: false });
  if (error) {
    throw new Error(`Invalid parameters for action ${actionName}: ${error.message}`);
  }
  return value;
}

module.exports = { validateParameters, parameterSchemas };