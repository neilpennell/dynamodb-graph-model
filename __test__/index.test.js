'use strict';

var AWS = require('aws-sdk');
var range = require('lodash/range');
var cuid = require('cuid');
var Model = require('../index.js');

var table = 'TestTable';
var type = 'Test';
var maxGSIK = 5;

describe('Model', () => {
  test('should return an object', () => {
    expect(typeof Model({ table, type, maxGSIK })).toEqual('object');
  });

  test('should return an error if type is undefined', () => {
    expect(() => Model({ table, maxGSIK })).toThrow('Type is undefined');
  });

  test('should return an error if maxGSIK is not a number', () => {
    expect(() => Model({ table, type, maxGSIK: '' })).toThrow(
      'Max GSIK is not a number'
    );
  });

  test('should create an instance of AWS.DynamoDB.DocumentClient if a documentClient driver is not provided', () => {
    expect(
      Model({ table, type, maxGSIK })._documentClient instanceof
        AWS.DynamoDB.DocumentClient
    ).toBe(true);
  });

  var documentClient = {
    put: params => ({ promise: () => Promise.resolve(params) }),
    batchWrite: params => ({ promise: () => Promise.resolve(params) }),
    query: params => ({ promise: () => Promise.resolve(params) })
  };
  var maxGSIK = 0;
  var data = 'example';
  var tenant = cuid();
  var Test = Model({ tenant, table, type, maxGSIK, documentClient });

  describe('#create()', () => {
    test('should throw an error if data is undefined', () => {
      expect(() => Test.create()).toThrow('Data is undefined');
    });

    test('should create just the node if properties is undefined', () => {
      return Test.create({ data })
        .then(result => {
          var node = result.node;
          expect(result.history[0]).toEqual({
            TableName: table,
            Item: {
              Data: JSON.stringify(data),
              Node: node,
              Target: node,
              Type: type,
              GSIK: node + '#0',
              MaxGSIK: 0
            }
          });
          expect(result.history[1]).toBe(undefined);
        })
        .catch(error => expect(error.message).toBe(null));
    });

    test('should create the properties on the correct node', () => {
      var properties = [['One', 1], ['Two', 2]];
      return Test.create({ data, properties }).then(result => {
        var node = result.node;
        expect(result.history[0]).toEqual({
          TableName: table,
          Item: {
            Data: JSON.stringify(data),
            Node: node,
            Target: node,
            Type: type,
            GSIK: node + '#0',
            MaxGSIK: 0
          }
        });
        expect(result.history[1]).toEqual([
          {
            RequestItems: {
              TestTable: [
                {
                  PutRequest: {
                    Item: {
                      Node: node,
                      Type: 'One',
                      Data: '1',
                      GSIK: node + '#0'
                    }
                  }
                },
                {
                  PutRequest: {
                    Item: {
                      Node: node,
                      Type: 'Two',
                      Data: '2',
                      GSIK: node + '#0'
                    }
                  }
                }
              ]
            }
          }
        ]);
      });
    });

    test('should create the properties on the correct node if given a properties map', () => {
      var properties = { One: 1, Two: 2 };
      return Test.create({ data, properties }).then(result => {
        var node = result.node;
        expect(result.history[0]).toEqual({
          TableName: table,
          Item: {
            Data: JSON.stringify(data),
            Node: node,
            Target: node,
            Type: type,
            GSIK: node + '#0',
            MaxGSIK: 0
          }
        });
        expect(result.history[1]).toEqual([
          {
            RequestItems: {
              TestTable: [
                {
                  PutRequest: {
                    Item: {
                      Node: node,
                      Type: 'One',
                      Data: '1',
                      GSIK: node + '#0'
                    }
                  }
                },
                {
                  PutRequest: {
                    Item: {
                      Node: node,
                      Type: 'Two',
                      Data: '2',
                      GSIK: node + '#0'
                    }
                  }
                }
              ]
            }
          }
        ]);
      });
    });

    test('should throw an error if maxGSIK is undefined', () => {
      var Test = Model({ tenant, table, type, documentClient });
      expect(() => Test.create({ data: 'Something' })).toThrow(
        'Max GSIK is undefined'
      );
    });
  });

  describe('#connect()', () => {
    var node = cuid();
    var type = 'Connection';
    var nodeB = cuid();
    var _documentClient = Object.assign({}, documentClient, {
      query: params => ({
        promise: () =>
          params.ProjectionExpression === '#Node, #Type, #Data, #GSIK, #MaxGSIK'
            ? Promise.resolve({
                Items: [{ MaxGSIK: maxGSIK }]
              })
            : Promise.resolve(
                Object.assign({}, params, {
                  Items: [
                    {
                      Node: nodeB,
                      Target: nodeB,
                      Data: JSON.stringify('Something'),
                      GSIK: nodeB + '#0',
                      Type: 'SomethingElse'
                    }
                  ]
                })
              )
      })
    });
    var TestC = Model({
      tenant,
      node,
      table,
      type,
      maxGSIK,
      documentClient: _documentClient
    });
    var TestB = Model({
      tenant,
      node: nodeB,
      table,
      type,
      maxGSIK,
      documentClient
    });

    test('should throw an error if node is undefined', () => {
      expect(() => Test.connect({ type })).toThrow('Node is undefined');
    });

    test('should throw an error if target is undefined', () => {
      expect(() => TestC.connect({ type })).toThrow('Target is undefined');
    });

    test('should throw an error if type is undefined', () => {
      expect(() => TestC.connect({ target: cuid() })).toThrow(
        'Type is undefined'
      );
    });

    test('should accept another Model to make the connection', () => {
      expect(() =>
        TestC.connect({
          target: TestB
        })
      ).not.toThrow('End node is undefined');
    });

    test('should save the edge on the database', () => {
      TestC.connect({
        target: TestB,
        type
      })
        .then(result => {
          expect(result.history[0]).toEqual({
            Item: {
              Data: '"Something"',
              GSIK: node + '#0',
              Node: node,
              Target: nodeB,
              Type: 'Connection'
            },
            TableName: 'TestTable'
          });
        })
        .catch(error => console.log(error));
    });

    test('should get the maxGSIK value if it is undefined', () => {
      var maxGSIK = 0;
      var TestC = Model({
        tenant,
        node,
        table,
        type,
        documentClient: _documentClient
      });

      return TestC.connect({
        target: TestB,
        type
      }).then(result => {
        expect(TestC.maxGSIK).toEqual(maxGSIK);
        expect(result.history[1]).toEqual({
          Item: {
            Data: '"Something"',
            GSIK: node + '#0',
            Node: node,
            Target: nodeB,
            Type: 'Connection'
          },
          TableName: 'TestTable'
        });
      });
    });
  });

  describe('#add()', () => {
    var node = cuid();
    var tenant = cuid();
    var type = 'Test';
    var data = 'Example';
    var maxGSIK = 0;
    var Test = Model({ tenant, node, table, type, maxGSIK, documentClient });

    test('should return a promise', () => {
      expect(Test.add({ type, data }) instanceof Promise).toBe(true);
    });

    test('should throw an error if node is undefined', () => {
      var Test = Model({ tenant, type, table, maxGSIK, documentClient });
      expect(() => Test.add()).toThrow('Node is undefined');
    });

    test('should throw an error if type is undfined', () => {
      expect(() => Test.add({ data })).toThrow('Type is undefined');
    });

    test('should throw an error if data is undfined', () => {
      expect(() => Test.add({ type })).toThrow('Data is undefined');
    });

    test('should create the new property on the node', () => {
      return Test.add({ type, data }).then(result => {
        expect(result.history[0]).toEqual({
          TableName: table,
          Item: {
            Node: result.node,
            Data: JSON.stringify(data),
            Type: type,
            GSIK: result.node + '#0'
          }
        });
      });
    });

    test('should get the maxGSIK value if it is undefined', () => {
      var maxGSIK = 0;
      var _documentClient = Object.assign({}, documentClient, {
        query: params => ({
          promise: () =>
            Promise.resolve({
              Items: [{ MaxGSIK: maxGSIK }]
            })
        })
      });
      var Test = Model({
        tenant,
        node,
        table,
        type,
        documentClient: _documentClient
      });

      return Test.add({ type, data }).then(result => {
        expect(Test.maxGSIK).toEqual(maxGSIK);
        expect(result.history[1]).toEqual({
          TableName: table,
          Item: {
            Node: result.node,
            Data: JSON.stringify(data),
            Type: type,
            GSIK: result.node + '#0'
          }
        });
      });
    });
  });

  describe('#set()', () => {
    var node = cuid();
    var tenant = cuid();
    var data = 'Data';
    var type = 'Type';
    var maxGSIK = 0;
    var properties = { One: 1 };
    var edges = {
      Edge: Model({ tenant, node, type, table, data, maxGSIK, documentClient })
    };
    var Test = Model({
      tenant,
      node,
      type,
      table,
      data,
      maxGSIK,
      documentClient
    });

    test('should return a Model with the new Node', () => {
      var newNode = cuid();
      Test.set(newNode);
      expect(Test.data).toEqual(undefined);
      expect(Test.node).toEqual(newNode);
      expect(Test.tenant).toEqual(tenant);
      expect(Test.properties).toEqual({});
      expect(Test.edges).toEqual({});
    });
  });

  describe('#get()', () => {
    var node = cuid();
    var target1 = cuid();
    var target2 = cuid();
    var documentClient = {
      query: params => ({
        promise: () => {
          switch (params.ProjectionExpression) {
            case '#Data':
              return Promise.resolve({
                Items: [{ Data: JSON.stringify('Data Text') }]
              });
            case '#Node, #Type, #Data':
              return Promise.resolve({
                Items: [
                  {
                    Node: node,
                    Type: 'PropertyType1',
                    Data: JSON.stringify('PropertyData1')
                  },
                  {
                    Node: node,
                    Type: 'PropertyType2',
                    Data: JSON.stringify('PropertyData2')
                  }
                ]
              });
            case '#Type, #Data, #Target':
              return Promise.resolve({
                Items: [
                  {
                    Type: 'EdgeType1',
                    Data: JSON.stringify('EdgeData1'),
                    Target: target1
                  },
                  {
                    Type: 'EdgeType2',
                    Data: JSON.stringify('EdgeData2'),
                    Target: target2
                  }
                ]
              });
            case '#Node, #Type, #Data, #GSIK, #MaxGSIK':
              return Promise.resolve({
                Items: [
                  {
                    Node: node,
                    Type: type,
                    Data: JSON.stringify('Data Text'),
                    GSIK: node + '#0',
                    MaxGSIK: 0
                  }
                ]
              });
          }
        }
      })
    };

    var Test = Model({ tenant, node, table, type, maxGSIK, documentClient });

    test('should return a promise', () => {
      expect(Test.get() instanceof Promise).toBe(true);
    });

    test('should query the node', () => {
      return Test.get().then(result => {
        expect(result.node).toEqual(node);
        expect(result.data).toEqual('Data Text');
        expect(result.properties).toEqual({
          PropertyType1: 'PropertyData1',
          PropertyType2: 'PropertyData2'
        });
        expect(result.edges.EdgeType1.node).toEqual(target1);
        expect(result.edges.EdgeType1.type).toEqual('EdgeType1');
        expect(result.edges.EdgeType1.data).toEqual('EdgeData1');
        expect(result.edges.EdgeType2.node).toEqual(target2);
        expect(result.edges.EdgeType2.type).toEqual('EdgeType2');
        expect(result.edges.EdgeType2.data).toEqual('EdgeData2');
      });
    });
  });

  describe('#collection()', () => {
    test('should return a promise', () => {
      expect(Test.collection() instanceof Promise).toBe(true);
    });

    test('should return a list of models', () => {
      var cuids = range(0, 6).map(() => cuid());
      var targets = range(0, 6).map(() => cuid());
      var response = {
        Count: 6,
        Items: [
          {
            Data: 'Data 0',
            Edges: [
              {
                Data: 'Edge 0',
                Node: cuids[0],
                Target: targets[0]
              }
            ],
            Node: cuids[0],
            Properties: [{ Data: 'Prop 0', Node: cuids[0] }]
          },
          {
            Data: 'Data 0',
            Edges: [
              {
                Data: 'Edge 1',
                Node: cuids[1],
                Target: targets[1]
              }
            ],
            Node: cuids[1],
            Properties: [{ Data: 'Prop 1', Node: cuids[1] }]
          },
          {
            Data: 'Data 1',
            Edges: [
              {
                Data: 'Edge 2',
                Node: cuids[2],
                Target: targets[2]
              }
            ],
            Node: cuids[2],
            Properties: [{ Data: 'Prop 2', Node: cuids[2] }]
          },
          {
            Data: 'Data 1',
            Edges: [
              {
                Data: 'Edge 3',
                Node: cuids[3],
                Target: targets[3]
              }
            ],
            Node: cuids[3],
            Properties: [{ Data: 'Prop 3', Node: cuids[3] }]
          },
          {
            Data: 'Data 2',
            Edges: [
              {
                Data: 'Edge 4',
                Node: cuids[4],
                Target: targets[4]
              }
            ],
            Node: cuids[4],
            Properties: [{ Data: 'Prop 4', Node: cuids[4] }]
          },
          {
            Data: 'Data 2',
            Edges: [
              {
                Data: 'Edge 5',
                Node: cuids[5],
                Target: targets[5]
              }
            ],
            Node: cuids[5],
            Properties: [{ Data: 'Prop 5', Node: cuids[5] }]
          }
        ],
        ScannedCount: 60
      };

      var db = {
        getNodesWithPropertiesAndEdges: config => {
          console.log(config);
          return Promise.resolve(response);
        }
      };

      var Test = Model({ tenant, table, type, maxGSIK, db });

      return Test.collection().then(results => {
        range(0, 6).forEach(i => {
          var model = results[i];
          expect(model.node).toEqual(cuids[i]);
          expect(model.edges).toEqual([
            {
              Data: `Edge ${i}`,
              Node: cuids[i],
              Target: targets[i]
            }
          ]);
          expect(model.tenant).toEqual(tenant);
          expect(model.type).toEqual(type);
          expect(model.properties).toEqual([
            {
              Data: `Prop ${i}`,
              Node: cuids[i]
            }
          ]);
        });
      });
    });
  });
});
