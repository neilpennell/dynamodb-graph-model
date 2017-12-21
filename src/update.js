'use strict';

var cuid = require('cuid');

/**
 * Takes in a document object, and creates the node, properties, and edges
 * on the DynamoDB Graph table. Then it returns the created object as a doc
 * back to the client.
 * For it to work, the model must first be configured with the table,
 * DynamoDB Document Client object, and maxGSIK value.
 *
 * Ex.
 * Model.config({
 *  table: process.env.TABLE_NAME,
 *  documentClient: new AWS.DynamoDB.DocumentClient(),
 *  maxGSIK: 4
 * });
 *
 * var Book = new Model({
 *  tenant: cuid(),
 *  type: 'Book',
 *  key: 'Name',
 *  properties: [
 *    'Genre'
 *  ],
 *  edges: [
 *    'Author',
 *    'Likes[]'
 *  ]
 * });
 *
 * Book.create({
 *  Name: 'Elantris',
 * })
 *  .then(result => {
 *    console.log(result);
 *    // {
 *    //    'id': 'cuix...'
 *    //    'Name': 'Elantris',
 *    // }
 *    result.Genre = 'Fantasy';
 *    result.Author = 'cuiv...';
 *    return Book.update(result);
 *  })
 *  .then((result) => {
 *    console.log(result);
 *    // {
 *    //    'id': 'cuix...',
 *    //    'Name': 'Elantris',
 *    //    'Genre': 'Fantasy'
 *    //    'Author': 'cuiv..',
 *    //    '@Author': 'Brandon Sanderson',
 *    // }
 *  })
 *
 * @param {object} options - Function configuration options.
 * @property {DynamoDBGraphDriver} db - DynamoDB Graph driver.
 * @property {edges[]} [edges] - List of strings that represent edges.
 * @property {string} key - Node data key name.
 * @property {number} maxGSIK - Maximum GSIK partitions.
 * @property {property[]} [properties] - List of strings that represent
 *                                       properties.
 * @property {string} [tenant] - Current tenant ID.
 * @property {string} type - Node type.
 * @return {function} Configured create function.
 * @param {object} doc - JavaScript object cotainging the node, properties, and
 *                       edges to update as a map. The only mandatory key is the
 *                       `id`, which identifies the node were the changes would
 *                       be applied.
 * @return {Promise} Promise that resolves into the newly created Doc.
 */
module.exports = function create(options) {
  var { db, tenant, type, key, maxGSIK, properties = [], edges = [] } = options;

  if (db === undefined) throw new Error('DB driver is undefined');
  if (type === undefined) throw new Error('Type is undefined');
  if (key === undefined) throw new Error('Key is undefined');
  if (maxGSIK === undefined) throw new Error('Max GSIK is undefined');

  return doc => {
    var node = doc.id;

    if (node === undefined) throw new Error('Node is undefined');

    var promises = [Promise.resolve()];

    var propMap = properties
      .filter(property => doc[property] !== undefined)
      .map(property => ({
        type: property,
        data: doc[property]
      }));

    var edgeMap = edges.filter(edge => doc[edge] !== undefined).map(edge => ({
      type: edge,
      target: doc[edge]
    }));

    if (propMap.length > 0)
      propMap.forEach(({ type, data }) =>
        promises.push(
          db.createProperty({
            tenant,
            type,
            node,
            data,
            maxGSIK
          })
        )
      );

    if (edgeMap.length > 0)
      edgeMap.forEach(edge => {
        var { type, target } = edge;
        return promises.push(
          db
            .createEdge({
              tenant,
              type,
              node,
              target,
              maxGSIK
            })
            .then(response => (edge.data = response.Item.Data))
        );
      });

    return Promise.all(promises).then(result => {
      return Object.assign(
        {
          id: node
        },
        doc,
        edgeMap.reduce(
          (acc, edge) =>
            Object.assign({}, acc, {
              [`@${edge.type}`]: edge.data
            }),
          {}
        )
      );
    });
  };
};
