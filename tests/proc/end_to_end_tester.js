/**
 * @license
 * Copyright 2015 The Lovefield Project Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
goog.setTestOnly();
goog.provide('lf.testing.EndToEndTester');

goog.require('goog.Promise');
goog.require('goog.array');
goog.require('goog.object');
goog.require('goog.testing.jsunit');
goog.require('lf.Exception');
goog.require('lf.bind');
goog.require('lf.schema.DataStoreType');
goog.require('lf.testing.hrSchema.JobDataGenerator');
goog.require('lf.testing.util');



/**
 * @constructor
 *
 * @param {!lf.Global} global
 * @param {!Function} connectFn
 */
lf.testing.EndToEndTester = function(global, connectFn) {
  /** @private {!Function} */
  this.connectFn_ = connectFn;

  /** @private {!lf.Database} */
  this.db_;

  /** @private {!lf.schema.Table} */
  this.e_;

  /** @private {!lf.schema.Table} */
  this.j_;

  /** @private {!lf.Global} */
  this.global_ = global;

  /** @private {!Array<!lf.Row>} */
  this.sampleJobs__;

  /** @private {!Array<function(): !IThenable>} */
  this.testCases_ = [
    this.testInsert.bind(this),
    this.testInsert_NoPrimaryKey.bind(this),
    this.testInsert_CrossColumnPrimaryKey.bind(this),
    this.testInsert_CrossColumnUniqueKey.bind(this),
    this.testInsert_AutoIncrement.bind(this),
    this.testInsertOrReplace_AutoIncrement.bind(this),
    this.testInsertOrReplace_Bind.bind(this),
    this.testInsertOrReplace_BindArray.bind(this),
    this.testUpdate_All.bind(this),
    this.testUpdate_Predicate.bind(this),
    this.testUpdate_UnboundPredicate.bind(this),
    this.testDelete_Predicate.bind(this),
    this.testDelete_UnboundPredicate.bind(this),
    this.testDelete_UnboundPredicateReject.bind(this),
    this.testDelete_All.bind(this),
    this.testObserve_MultipleObservers.bind(this)
  ];
};


/**
 * Runs all the tests.
 * @return {!IThenable}
 */
lf.testing.EndToEndTester.prototype.run = function() {
  var tests = [];
  this.testCases_.forEach(function(test) {
    tests.push(this.setUp_.bind(this));
    tests.push(test);
  }, this);

  return lf.testing.util.sequentiallyRun(tests);
};


/**
 * @param {string} name
 * @private
 */
lf.testing.EndToEndTester.markDone_ = function(name) {
  console['log'](name + ': PASSED');
};


/**
 * @return {!IThenable}
 * @private
 */
lf.testing.EndToEndTester.prototype.setUp_ = function() {
  return this.connectFn_({storeType: lf.schema.DataStoreType.MEMORY}).then(
      function(database) {
        this.db_ = database;
        this.j_ = this.db_.getSchema().table('Job');
        this.e_ = this.db_.getSchema().table('Employee');
        return this.addSampleData_(50);
      }.bind(this));
};


/**
 * Populates the databse with sample data.
 * @param {number} rowCount The number of rows to insert.
 * @return {!IThenable} A signal firing when the data has been added.
 * @private
 */
lf.testing.EndToEndTester.prototype.addSampleData_ = function(rowCount) {
  var schema = this.db_.getSchema();
  var jobGenerator =
      new lf.testing.hrSchema.JobDataGenerator(schema);
  this.sampleJobs_ = jobGenerator.generate(rowCount);

  return this.db_.insert().into(this.j_).values(this.sampleJobs_).exec();
};


/**
 * Tests that an INSERT query does indeed add a new record in the database.
 * @return {!IThenable}
 */
lf.testing.EndToEndTester.prototype.testInsert = function() {
  var row = this.j_.createRow({
    'id': 'dummyJobId'
  });

  var queryBuilder = /** @type {!lf.query.InsertBuilder} */ (
      this.db_.insert().into(this.j_).values([row]));

  return queryBuilder.exec().then(
      function(results) {
        assertEquals(1, results.length);
        assertEquals(row.payload()['id'], results[0]['id']);

        return lf.testing.util.selectAll(this.global_, this.j_);
      }.bind(this)).then(
      function(results) {
        assertEquals(this.sampleJobs_.length + 1, results.length);
        lf.testing.EndToEndTester.markDone_('testInsert');
      }.bind(this));
};


/**
 * Tests that insertion succeeds for tables where no primary key is specified.
 * @return {!IThenable}
 */
lf.testing.EndToEndTester.prototype.testInsert_NoPrimaryKey = function() {
  var jobHistory = this.db_.getSchema().table('JobHistory');
  assertNull(jobHistory.getConstraint().getPrimaryKey());
  var row = jobHistory.createRow();

  var queryBuilder = /** @type {!lf.query.InsertBuilder} */ (
      this.db_.insert().into(jobHistory).values([row]));

  return queryBuilder.exec().then(
      function(results) {
        assertEquals(1, results.length);
        return lf.testing.util.selectAll(this.global_, jobHistory);
      }.bind(this)).then(
      function(results) {
        assertEquals(1, results.length);
        lf.testing.EndToEndTester.markDone_('testInsert_NoPrimaryKey');
      });
};


/** @return {!IThenable} */
lf.testing.EndToEndTester.prototype.testInsert_CrossColumnPrimaryKey =
    function() {
  var table = this.db_.getSchema().table('DummyTable');

  var q1 = this.db_.insert().into(table).values([table.createRow()]);
  var q2 = this.db_.insert().into(table).values([table.createRow()]);

  return q1.exec().then(
      function(results) {
        assertEquals(1, results.length);
        return q2.exec();
      }).then(
      fail,
      function(e) {
        assertEquals(lf.Exception.Type.CONSTRAINT, e.name);
        lf.testing.EndToEndTester.markDone_(
                'testInsert_CrossColumnPrimaryKey');
      });
};


/** @return {!IThenable} */
lf.testing.EndToEndTester.prototype.testInsert_CrossColumnUniqueKey =
    function() {
  var table = this.db_.getSchema().table('DummyTable');

  // Creating two rows where 'uq_constraint' is violated.
  var row1 = table.createRow({
    'string': 'string1',
    'number': 1,
    'integer': 100,
    'boolean': false
  });
  var row2 = table.createRow({
    'string': 'string2',
    'number': 2,
    'integer': 100,
    'boolean': false
  });

  var q1 = this.db_.insert().into(table).values([row1]);
  var q2 = this.db_.insert().into(table).values([row2]);

  return q1.exec().then(
      function(results) {
        assertEquals(1, results.length);
        return q2.exec();
      }).then(
      fail,
      function(e) {
        assertEquals(lf.Exception.Type.CONSTRAINT, e.name);
        lf.testing.EndToEndTester.markDone_(
                'testInsert_CrossColumnUniqueKey');
      });
};


/**
 * Tests that an INSERT query on a tabe that uses 'autoIncrement' primary key
 * does indeed automatically assign incrementing primary keys to rows being
 * inserted.
 * @return {!IThenable}
 */
lf.testing.EndToEndTester.prototype.testInsert_AutoIncrement = function() {
  return this.checkAutoIncrement_(this.db_.insert.bind(this.db_)).then(
      function() {
        lf.testing.EndToEndTester.markDone_('testInsert_AutoIncrement');
      });
};


/**
 * Tests that an INSERT OR REPLACE query on a tabe that uses 'autoIncrement'
 * primary key does indeed automatically assign incrementing primary keys to
 * rows being inserted.
 * @return {!IThenable}
 */
lf.testing.EndToEndTester.prototype.testInsertOrReplace_AutoIncrement =
    function() {
  return this.checkAutoIncrement_(
      this.db_.insertOrReplace.bind(this.db_)).then(function() {
    lf.testing.EndToEndTester.markDone_(
        'testInsertOrReplace_AutoIncrement');
  });
};


/**
 * Tests INSERT OR REPLACE query accepts value binding.
 * @return {!IThenable}
 */
lf.testing.EndToEndTester.prototype.testInsertOrReplace_Bind = function() {
  var region = this.db_.getSchema().table('Region');
  var rows = [region.createRow({'id': 'd1'}), region.createRow({'id': 'd2'})];

  var queryBuilder = /** @type {!lf.query.InsertBuilder} */ (
      this.db_.insertOrReplace().into(region).
      values([lf.bind(0), lf.bind(1)]));

  return queryBuilder.bind(rows).exec().then(function() {
    return lf.testing.util.selectAll(this.global_, region);
  }.bind(this)).then(function(results) {
    assertEquals(2, results.length);
    lf.testing.EndToEndTester.markDone_('testInsertOrReplace_Bind');
  }.bind(this));
};


/**
 * Tests INSERT OR REPLACE query accepts value binding.
 * @return {!IThenable}
 */
lf.testing.EndToEndTester.prototype.testInsertOrReplace_BindArray = function() {
  var region = this.db_.getSchema().table('Region');
  var rows = [region.createRow({'id': 'd1'}), region.createRow({'id': 'd2'})];

  var queryBuilder = /** @type {!lf.query.InsertBuilder} */ (
      this.db_.insertOrReplace().into(region).values(lf.bind(0)));

  return queryBuilder.bind([rows]).exec().then(function() {
    return lf.testing.util.selectAll(this.global_, region);
  }.bind(this)).then(function(results) {
    assertEquals(2, results.length);
    lf.testing.EndToEndTester.markDone_('testInsertOrReplace_BindArray');
  }.bind(this));
};


/**
 * @param {!function():!lf.query.Insert} builderFn The function to call for
 *     getting a new query builder (insert() or insertOrReplace()).
 * @return {!IThenable}
 * @private
 */
lf.testing.EndToEndTester.prototype.checkAutoIncrement_ = function(builderFn) {
  var c = this.db_.getSchema().table('Country');

  var firstBatch = new Array(3);
  for (var i = 0; i < firstBatch.length; i++) {
    firstBatch[i] = c.createRow();
    // Default value of the primary key column is set to 0 within createRow
    // (since only integer keys are allowed to be marked as auto-incrementing),
    // which will trigger an automatically assigned primary key.
  }

  var secondBatch = new Array(4);
  for (var i = 0; i < secondBatch.length; i++) {
    secondBatch[i] = c.createRow({
      'name': 'holiday' + i.toString(),
      'regionId': 'region' + i.toString()
    });
    // 'id' is not specified in the 2nd batch, which should also trigger
    // automatically assigned primary keys.
  }

  var thirdBatch = new Array(5);
  for (var i = 0; i < thirdBatch.length; i++) {
    thirdBatch[i] = c.createRow({
      'name': 'holiday' + i.toString(),
      'regionId': 'region' + i.toString(),
      'id': null
    });
    // 'id' is set to null in the 3rd batch, which should also trigger
    // automatically assigned primary keys.
  }

  // Adding a row with a manually assigned primary key. This ID should not be
  // replaced by an automatically assigned ID.
  var manuallyAssignedId = 1000;
  var manualRow = c.createRow();
  manualRow.payload()['id'] = manuallyAssignedId;
  var global = this.global_;

  return builderFn().into(c).values(firstBatch).exec().then(
      function(results) {
        assertEquals(firstBatch.length, results.length);
        return builderFn().into(c).values(secondBatch).exec();
      }).then(
      function(results) {
        assertEquals(secondBatch.length, results.length);
        return builderFn().into(c).values(thirdBatch).exec();
      }).then(
      function(results) {
        assertEquals(thirdBatch.length, results.length);
        return builderFn().into(c).values([manualRow]).exec();
      }).then(
      function(results) {
        assertEquals(1, results.length);
        return lf.testing.util.selectAll(global, c);
      }).then(
      function(results) {
        // Sorting by primary key.
        results.sort(function(leftRow, rightRow) {
          return leftRow.payload()['id'] - rightRow.payload()['id'];
        });

        // Checking that all primary keys starting from 1 were automatically
        // assigned.
        results.forEach(function(row, index) {
          if (index < results.length - 1) {
            assertEquals(index + 1, row.payload()['id']);
          } else {
            assertEquals(manuallyAssignedId, row.payload()['id']);
          }
        });
      });
};


/**
 * Tests that an UPDATE query does indeed update records in the database.
 * @return {!IThenable}
 */
lf.testing.EndToEndTester.prototype.testUpdate_All = function() {
  var minSalary = 0;
  var maxSalary = 1000;
  var queryBuilder =
      this.db_.update(this.j_).
          set(this.j_.minSalary, minSalary).
          set(this.j_.maxSalary, maxSalary);

  var minSalaryName = this.j_.minSalary.getName();
  var maxSalaryName = this.j_.maxSalary.getName();

  return queryBuilder.exec().then(
      function() {
        return lf.testing.util.selectAll(this.global_, this.j_);
      }.bind(this)).then(
      function(results) {
        results.forEach(function(row) {
          assertEquals(minSalary, row.payload()[minSalaryName]);
          assertEquals(maxSalary, row.payload()[maxSalaryName]);
        });
        lf.testing.EndToEndTester.markDone_('testUpdate_All');
      });
};


/**
 * Tests that an UPDATE query with a predicate does updates the corresponding
 * records in the database.
 * @return {!IThenable}
 */
lf.testing.EndToEndTester.prototype.testUpdate_Predicate = function() {
  var jobId = this.sampleJobs_[0].payload()['id'];

  var queryBuilder =
      this.db_.update(this.j_).
          where(this.j_.id.eq(jobId)).
          set(this.j_.minSalary, 10000).
          set(this.j_.maxSalary, 20000);

  return queryBuilder.exec().then(function() {
    return lf.testing.util.selectAll(this.global_, this.j_);
  }.bind(this)).then(function(results) {
    var verified = false;
    for (var i = 0; i < results.length; ++i) {
      var row = results[i];
      if (row.payload()['id'] == jobId) {
        assertEquals(10000, row.payload()['minSalary']);
        assertEquals(20000, row.payload()['maxSalary']);
        verified = true;
        break;
      }
    }
    assertTrue(verified);
    lf.testing.EndToEndTester.markDone_('testUpdate_Predicate');
  });
};


/** @return {!IThenable} */
lf.testing.EndToEndTester.prototype.testUpdate_UnboundPredicate = function() {
  var queryBuilder =
      this.db_.update(this.j_).
          set(this.j_.minSalary, lf.bind(1)).
          set(this.j_.maxSalary, 20000).
          where(this.j_.id.eq(lf.bind(0)));

  var jobId = this.sampleJobs_[0].payload()['id'];
  var minSalaryName = this.j_.minSalary.getName();
  var maxSalaryName = this.j_.maxSalary.getName();

  return queryBuilder.bind([jobId, 10000]).exec().then(function() {
    return lf.testing.util.selectAll(this.global_, this.j_);
  }.bind(this)).then(function() {
    return this.db_.select().from(this.j_).where(this.j_.id.eq(jobId)).exec();
  }.bind(this)).then(function(results) {
    assertEquals(10000, results[0][minSalaryName]);
    assertEquals(20000, results[0][maxSalaryName]);
    return queryBuilder.bind([jobId, 15000]).exec();
  }.bind(this)).then(function() {
    return this.db_.select().from(this.j_).where(this.j_.id.eq(jobId)).exec();
  }.bind(this)).then(function(results) {
    assertEquals(15000, results[0][minSalaryName]);
    assertEquals(20000, results[0][maxSalaryName]);
    lf.testing.EndToEndTester.markDone_('testUpdate_UnboundPredicate');
  });
};


/**
 * Tests that a DELETE query with a specified predicate deletes only the records
 * that satisfy the predicate.
 * @return {!IThenable}
 */
lf.testing.EndToEndTester.prototype.testDelete_Predicate = function() {
  var jobId = 'jobId' + Math.floor(this.sampleJobs_.length / 2).toString();
  var queryBuilder =
      this.db_.delete().from(this.j_).where(this.j_.id.eq(jobId));

  return queryBuilder.exec().then(
      function() {
        return lf.testing.util.selectAll(this.global_, this.j_);
      }.bind(this)).then(
      function(results) {
        assertEquals(this.sampleJobs_.length - 1, results.length);
        lf.testing.EndToEndTester.markDone_('testDelete_Predicate');
      }.bind(this));
};


/** @return {!IThenable} */
lf.testing.EndToEndTester.prototype.testDelete_UnboundPredicate = function() {
  var jobId = 'jobId' + Math.floor(this.sampleJobs_.length / 2).toString();
  var queryBuilder =
      this.db_.delete().from(this.j_).where(this.j_.id.eq(lf.bind(1)));

  return queryBuilder.bind(['', jobId]).exec().then(
      function() {
        return lf.testing.util.selectAll(this.global_, this.j_);
      }.bind(this)).then(
      function(results) {
        assertEquals(this.sampleJobs_.length - 1, results.length);
        lf.testing.EndToEndTester.markDone_('testDelete_UnboundPredicate');
      }.bind(this));
};


/** @return {!IThenable} */
lf.testing.EndToEndTester.prototype.testDelete_UnboundPredicateReject =
    function() {
  var queryBuilder =
      this.db_.delete().from(this.j_).where(this.j_.id.eq(lf.bind(1)));

  return queryBuilder.exec().then(fail, function(e) {
    assertEquals(lf.Exception.Type.SYNTAX, e.name);
    lf.testing.EndToEndTester.markDone_('testDelete_UnboundPredicateReject');
  });
};


/**
 * Tests that a DELETE query without a specified predicate deletes the entire
 * table.
 * @return {!IThenable}
 */
lf.testing.EndToEndTester.prototype.testDelete_All = function() {
  var queryBuilder = this.db_.delete().from(this.j_);

  return queryBuilder.exec().then(
      function() {
        return lf.testing.util.selectAll(this.global_, this.j_);
      }.bind(this)).then(
      function(results) {
        assertEquals(0, results.length);
        lf.testing.EndToEndTester.markDone_('testDelete_All');
      });
};


/**
 * Tests the case where multiple observers are registered for the same query
 * semantically (but not the same query object instance). Each observer should
 * receive different "change" records, depending on the time it was registered.
 * @return {!IThenable}
 */
lf.testing.EndToEndTester.prototype.testObserve_MultipleObservers = function() {
  asyncTestCase.waitForAsync('testObserve_MultipleObservers');

  var schema = this.db_.getSchema();
  var jobGenerator = new lf.testing.hrSchema.JobDataGenerator(schema);

  /**
   * @param {number} id A suffix to apply to the ID (to avoid triggering
   * constraint violations).
   * @return {!lf.Row}
   */
  var createNewRow = function(id) {
    var sampleJob = jobGenerator.generate(1)[0];
    sampleJob.payload()['id'] = 'someJobId' + id;
    return sampleJob;
  };

  /**
   * @return {!lf.query.Select}
   * @this {!lf.testing.EndToEndTester}
   */
  var getQuery = (function() {
    return this.db_.select().from(this.j_);
  }.bind(this));

  var callback1Params = [];
  var callback2Params = [];
  var callback3Params = [];

  var resolver = goog.Promise.withResolver();
  var doAssertions = (function() {
    try {
      // Expecting callback1 to have been called 3 times.
      assertArrayEquals([this.sampleJobs_.length + 1, 1, 1], callback1Params);
      // Expecting callback2 to have been called 2 times.
      assertArrayEquals([this.sampleJobs_.length + 2, 1], callback2Params);
      // Expecting callback3 to have been called 1 time.
      assertArrayEquals([this.sampleJobs_.length + 3], callback3Params);
    } catch (e) {
      resolver.reject(e);
    }
    lf.testing.EndToEndTester.markDone_('testObserve_MultipleObservers');
    resolver.resolve();
  }.bind(this));

  var callback1 = function(changes) { callback1Params.push(changes.length); };
  var callback2 = function(changes) { callback2Params.push(changes.length); };
  var callback3 = function(changes) {
    callback3Params.push(changes.length);
    doAssertions();
  };

  this.db_.observe(getQuery(), callback1);
  this.db_.insert().into(this.j_).values([createNewRow(1)]).exec().then(
      function() {
        this.db_.observe(getQuery(), callback2);
        return this.db_.insert().into(this.j_).values([createNewRow(2)]).exec();
      }.bind(this)).then(
      function() {
        this.db_.observe(getQuery(), callback3);
        return this.db_.insert().into(this.j_).values([createNewRow(3)]).exec();
      }.bind(this));

  return resolver.promise;
};
